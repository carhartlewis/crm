import { createId, ID_PREFIXES } from "@crm/core/ids";
import { DEAL_STAGES, LOGGED_ACTIVITY_TYPES } from "@crm/core/records";
import type { LocalTool } from "@crm/integrations/gateway";
import type { WebReader } from "@crm/core/brand";
import type { JevClient } from "@crm/memory/jev";
import { gatewayJev } from "@crm/memory/jev-gateway";
import { Context, Effect, Exit, Layer, Option, Schema } from "effect";
import { Brand } from "./Brand.ts";
import { Enrichment } from "./Enrichment.ts";
import {
  type EnrichmentToolCaller,
  type EnrichmentToolDeps,
  enrichmentTools,
  pgContactMatches,
} from "./enrichment-tools.ts";
import { AppConfig } from "../config.ts";
import { Companies, type CompaniesService } from "./Companies.ts";
import { postgresDirectory } from "./crm-directory.ts";
import { factSubject } from "./fact-subject.ts";
import { Fields, type FieldsService } from "./Fields.ts";
import { fieldTools } from "./field-tools.ts";
import { Intel, type IntelService } from "./Intel.ts";
import { intelTools } from "./intel-tools.ts";
import { type AgentResult, Memory, type MemoryService } from "./Memory.ts";
import { Postgres } from "./Postgres.ts";
import { Records, type RecordsService } from "./Records.ts";

/**
 * The CRM's own tools on the MCP gateway (ADR 0018): the agent reaches companies, members and
 * memory the same way as connected apps, as `crm__<tool>`. Each runs as the caller in the
 * workspace their token names. Reads carry `readOnlyHint`; the agent asks before any other.
 */

export interface DirectoryCompany {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
  readonly industry: string | null;
  readonly location: string | null;
  readonly description: string | null;
  readonly ownerName: string | null;
  readonly contacts: number;
  readonly openDeals: number;
  readonly lastActivityAt: string | null;
  readonly createdAt: string;
}

export interface DirectoryContact {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly ownerName: string | null;
  readonly lastActivityAt: string | null;
}

export interface DirectoryDeal {
  readonly id: string;
  readonly name: string;
  readonly stage: string;
  readonly amount: string | null;
  readonly currency: string;
  readonly expectedCloseDate: string | null;
  readonly companyId: string;
  readonly companyName: string;
  readonly ownerName: string | null;
  readonly description: string | null;
  readonly closedReason: string | null;
  readonly lastActivityAt: string | null;
}

export interface DirectoryMember {
  readonly id?: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

/** Workspace-scoped reads for the tools. */
export interface CrmDirectory {
  companies(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<readonly DirectoryCompany[]>;
  company(workspaceId: string, id: string): Promise<DirectoryCompany | null>;
  /** `companyId` empty means every company. */
  contacts(
    workspaceId: string,
    query: string,
    companyId: string,
    limit: number,
  ): Promise<readonly DirectoryContact[]>;
  contact(workspaceId: string, id: string): Promise<DirectoryContact | null>;
  /** `stage`: a stage id, `open`, `closed`, or empty for all. */
  deals(
    workspaceId: string,
    query: string,
    filter: { readonly companyId: string; readonly stage: string },
    limit: number,
  ): Promise<readonly DirectoryDeal[]>;
  deal(workspaceId: string, id: string): Promise<DirectoryDeal | null>;
  members(workspaceId: string): Promise<readonly DirectoryMember[]>;
}

export interface CrmToolDeps {
  readonly directory: CrmDirectory;
  readonly companies: CompaniesService;
  readonly records: RecordsService;
  readonly memory: Pick<
    MemoryService["agent"],
    "knowledge" | "search" | "remember" | "forget" | "research"
  >;
  /** context.dev, when the API has a key; without it the web tools aren't listed. */
  readonly web: WebReader | null;
  /** Jev, to file a fact under the company it is about; without it facts the agent gives no
   * company for stay with the workspace unless they name one. */
  readonly jev: JevClient | null;
  /** What the agent learns about records (ADR 0024); without it those tools aren't listed. */
  readonly intel?: IntelService;
  /** Custom fields; without it `crm__list_fields` and `crm__set_field_value` aren't listed. */
  readonly fields?: FieldsService;
  /** People and company enrichment (ADR 0027); without a treg token those tools aren't listed. */
  readonly enrichment?: Omit<EnrichmentToolDeps, "web"> | null;
}

/** How long saving a fact waits for Jev to say which company it is about. */
const SUBJECT_WAIT_MS = 3000;

/** The tool's answer: JSON the model reads. A type alias: MCP results need an index signature. */
export type ToolResult = {
  isError?: boolean;
  content: [{ type: "text"; text: string }];
};

export const answer = <T>(value: T): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

export const refuse = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

const fromAgent = <T, D>(result: AgentResult<T>, done: D) =>
  result.ok ? answer(result.value ?? done) : refuse(result.message);

/** The first failure's message, as the model should read it. */
export async function run<A>(effect: Effect.Effect<A, { readonly message: string }>) {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) return answer(exit.value);

  return Option.match(Exit.findErrorOption(exit), {
    onNone: () => refuse("The CRM could not do that. Try again later."),
    onSome: (error) => refuse(error.message),
  });
}

const CompanyId = Schema.String.annotate({
  description: "A company id from crm__list_companies, such as com_…",
});

const ContactId = Schema.String.annotate({
  description: "A contact id from crm__list_contacts, such as ctc_…",
});

const DealId = Schema.String.annotate({
  description: "A deal id from crm__list_deals, such as del_…",
});

const OwnerId = Schema.optional(Schema.NullOr(Schema.String)).annotate({
  description: "A member's user id from crm__list_members; null leaves it unassigned.",
});

const Limit = Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })));

const Text = (description: string) =>
  Schema.optional(Schema.NullOr(Schema.String)).annotate({ description });

const STAGE_HELP = `One of: ${DEAL_STAGES.map((stage) => `${stage.id} (${stage.label})`).join(", ")}.`;

/** One tool: its MCP definition, and a call that decodes its arguments first. */
export function tool<S extends Schema.Top & { readonly DecodingServices: never }>(
  definition: {
    readonly name: string;
    readonly description: string;
    readonly readOnly: boolean;
    readonly destructive?: boolean;
    readonly input: S;
  },
  call: (input: S["Type"]) => Promise<ToolResult>,
): LocalTool {
  const decode = Schema.decodeUnknownOption(definition.input);
  const document = Schema.toJsonSchemaDocument(definition.input);

  return {
    tool: {
      name: `crm__${definition.name}`,
      description: definition.description,
      // SAFETY: a Struct schema's JSON Schema document is an object schema.
      inputSchema: { ...document.schema, type: "object" } as LocalTool["tool"]["inputSchema"],
      annotations: {
        readOnlyHint: definition.readOnly,
        destructiveHint: definition.destructive ?? false,
      },
    },
    call: async (args) =>
      Option.match(decode(args), {
        onNone: () => Promise.resolve(refuse(`Invalid input for crm__${definition.name}.`)),
        onSome: call,
      }),
  };
}

const MemoryTarget = {
  companyId: Schema.optional(CompanyId).annotate({
    description:
      "The company the memory is about. Pass at most one of companyId, contactId and dealId; leave all out for the workspace's own company.",
  }),
  contactId: Schema.optional(ContactId).annotate({
    description: "The person the memory is about.",
  }),
  dealId: Schema.optional(DealId).annotate({ description: "The deal the memory is about." }),
};

/** The caller's tools. `caller` comes from a verified token (OAuth MCP or agent token). */
/** context.dev, for any company or page on the web (ADR 0018). */
function webTools(web: WebReader): readonly LocalTool[] {
  return [
    tool(
      {
        name: "lookup_company",
        description:
          "Look up any company on the web: name, description, industries, address, social profiles, key pages, public email and phone, stock ticker. Pass its website domain (best), its name, or a work email at it. Use it to research a company before adding it to the CRM or meeting it.",
        readOnly: true,
        input: Schema.Struct({
          domain: Schema.optional(Schema.String).annotate({ description: "Such as acme.com." }),
          name: Schema.optional(Schema.String).annotate({ description: "3 to 30 characters." }),
          email: Schema.optional(Schema.String).annotate({ description: "A work email." }),
        }),
      },
      async (input) => {
        const query = input.domain
          ? { domain: input.domain }
          : input.name
            ? { name: input.name }
            : input.email
              ? { email: input.email }
              : null;

        if (!query) return refuse("Pass a domain, a name or a work email.");

        const profile = await web.lookup(query);

        return profile ? answer(profile) : refuse("No company profile was found for that.");
      },
    ),
    tool(
      {
        name: "read_web_page",
        description:
          "Read one web page as clean Markdown (it is rendered first, so pages that need JavaScript work too): a company's pricing, about, careers or blog page, a news article, a document. Long pages are cut.",
        readOnly: true,
        input: Schema.Struct({
          url: Schema.String.annotate({ description: "The full http(s) URL." }),
        }),
      },
      async (input) => {
        const markdown = await web.readPage(input.url);

        return markdown
          ? answer({ url: input.url, markdown })
          : refuse("The page couldn't be read. Check the URL, or try another page.");
      },
    ),
  ];
}

export function crmTools(deps: CrmToolDeps, caller: EnrichmentToolCaller): readonly LocalTool[] {
  const actor = { userId: caller.userId, activeWorkspaceId: caller.workspaceId };

  return [
    ...(deps.web ? webTools(deps.web) : []),
    ...(deps.enrichment ? enrichmentTools({ ...deps.enrichment, web: deps.web }, caller) : []),
    tool(
      {
        name: "list_companies",
        description:
          "List the companies in the CRM, by name. Pass `query` to match part of a name or domain.",
        readOnly: true,
        input: Schema.Struct({
          query: Schema.optional(Schema.String),
          limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
        }),
      },
      async (input) =>
        answer({
          companies: await deps.directory.companies(
            caller.workspaceId,
            input.query?.trim() ?? "",
            input.limit ?? 50,
          ),
        }),
    ),
    tool(
      {
        name: "get_company",
        description:
          "One company in the CRM: name, domain, industry, location, about, owner, contact and open-deal counts.",
        readOnly: true,
        input: Schema.Struct({ id: CompanyId }),
      },
      async (input) => {
        const company = await deps.directory.company(caller.workspaceId, input.id);

        return company ? answer(company) : refuse("No company with that id in this workspace.");
      },
    ),
    tool(
      {
        name: "create_company",
        description: "Add a company to the CRM. The caller becomes its owner.",
        readOnly: false,
        input: Schema.Struct({
          name: Schema.String,
          domain: Schema.optional(Schema.NullOr(Schema.String)).annotate({
            description: "The company's website domain, such as acme.com.",
          }),
        }),
      },
      (input) => {
        const id = createId(ID_PREFIXES.company);

        return run(
          deps.companies
            .create(actor, { id, name: input.name, domain: input.domain ?? null })
            .pipe(Effect.as({ id, created: true })),
        );
      },
    ),
    tool(
      {
        name: "update_company",
        description:
          "Change a company's details. Leave out what stays the same; null clears a field. `archived: true` hides it from lists.",
        readOnly: false,
        input: Schema.Struct({
          id: CompanyId,
          name: Schema.optional(Schema.String),
          domain: Text("Website domain, such as acme.com."),
          website: Text("Full website URL."),
          description: Text("What the company does, in a few sentences."),
          industry: Text("Industry, such as Software or Healthcare."),
          employee_count: Text("Headcount as a source states it, such as 15 or 51-200."),
          founded_year: Text("The year it was founded, such as 2019."),
          city: Text("City of the headquarters."),
          country: Text("Country of the headquarters."),
          phone: Text("Main phone number."),
          email: Text("General contact email."),
          linkedin_url: Text("LinkedIn page URL."),
          twitter_url: Text("X (Twitter) URL."),
          github_url: Text("GitHub URL."),
          owner_id: OwnerId,
          primary_contact_id: Text("A contact at this company to mark as primary."),
          archived: Schema.optional(Schema.Boolean),
        }),
      },
      ({ id, ...patch }) =>
        run(deps.companies.update(actor, id, patch).pipe(Effect.as({ id, updated: true }))),
    ),
    tool(
      {
        name: "list_contacts",
        description:
          "List people in the CRM. Pass `query` to match a name, email or title, and `companyId` for one company's people.",
        readOnly: true,
        input: Schema.Struct({
          query: Schema.optional(Schema.String),
          companyId: Schema.optional(CompanyId),
          limit: Limit,
        }),
      },
      async (input) =>
        answer({
          contacts: await deps.directory.contacts(
            caller.workspaceId,
            input.query?.trim() ?? "",
            input.companyId ?? "",
            input.limit ?? 50,
          ),
        }),
    ),
    tool(
      {
        name: "get_contact",
        description:
          "One contact: name, title, email, phone, company, owner and saved memory (profile, facts and source status). Read this before answering who someone is or what we know about them. A memory error means unavailable, not empty.",
        readOnly: true,
        input: Schema.Struct({ id: ContactId }),
      },
      async (input) => {
        const contact = await deps.directory.contact(caller.workspaceId, input.id);

        if (!contact) return refuse("No contact with that id in this workspace.");

        return answer({
          ...contact,
          memory: await deps.memory.knowledge(caller, { contactId: contact.id }),
        });
      },
    ),
    tool(
      {
        name: "create_contact",
        description:
          "Add a person to the CRM at their company. Every contact needs one: find it with crm__list_companies, or add it with crm__create_company first (for a founder or angel, the company they run or work at). The caller becomes the owner, and the CRM then researches them in the background (email, phone, photo, background). Check crm__list_contacts first so nobody is added twice. Set `found_by_search` when the person came from crm__find_people.",
        readOnly: false,
        input: Schema.Struct({
          first_name: Schema.String,
          last_name: Text("Last name."),
          title: Text("Job title, such as Head of Security."),
          email: Text("Work email."),
          phone: Text("Phone number."),
          linkedin_url: Text("Their LinkedIn profile URL."),
          company_id: CompanyId,
          found_by_search: Schema.optional(Schema.Boolean),
        }),
      },
      (input) => {
        const id = createId(ID_PREFIXES.contact);
        const { found_by_search: searched, ...fields } = input;

        return run(
          deps.records.contacts
            .create(actor, { ...fields, id, source: searched ? "search" : "manual" })
            .pipe(Effect.as({ id, created: true })),
        );
      },
    ),
    tool(
      {
        name: "update_contact",
        description:
          "Change a contact's details. Leave out what stays the same; null clears a field. `archived: true` hides them from lists.",
        readOnly: false,
        input: Schema.Struct({
          id: ContactId,
          first_name: Schema.optional(Schema.String),
          last_name: Text("Last name."),
          title: Text("Job title."),
          email: Text("Work email."),
          phone: Text("Phone number."),
          linkedin_url: Text("LinkedIn profile URL."),
          twitter_url: Text("X (Twitter) URL."),
          github_url: Text("GitHub URL."),
          seniority: Text("Seniority, such as Executive or Manager."),
          function: Text("Function, such as Engineering or Finance."),
          company_id: Schema.optional(CompanyId).annotate({
            description: "Move them to another company. A contact always keeps one.",
          }),
          owner_id: OwnerId,
          archived: Schema.optional(Schema.Boolean),
        }),
      },
      ({ id, ...patch }) =>
        run(deps.records.contacts.update(actor, id, patch).pipe(Effect.as({ id, updated: true }))),
    ),
    tool(
      {
        name: "list_deals",
        description:
          "List deals with their company, stage, amount and close date. Filter by `query` (deal or company name), `companyId`, or `stage` (a stage id, `open` or `closed`).",
        readOnly: true,
        input: Schema.Struct({
          query: Schema.optional(Schema.String),
          companyId: Schema.optional(CompanyId),
          stage: Schema.optional(Schema.String),
          limit: Limit,
        }),
      },
      async (input) =>
        answer({
          deals: await deps.directory.deals(
            caller.workspaceId,
            input.query?.trim() ?? "",
            { companyId: input.companyId ?? "", stage: input.stage ?? "" },
            input.limit ?? 50,
          ),
        }),
    ),
    tool(
      {
        name: "get_deal",
        description:
          "One deal: stage, amount, currency, close date, company, owner, description and saved memory (profile, facts and source status). Read this before answering what we know about a deal. A memory error means unavailable, not empty.",
        readOnly: true,
        input: Schema.Struct({ id: DealId }),
      },
      async (input) => {
        const deal = await deps.directory.deal(caller.workspaceId, input.id);

        if (!deal) return refuse("No deal with that id in this workspace.");

        return answer({
          ...deal,
          memory: await deps.memory.knowledge(caller, { dealId: deal.id }),
        });
      },
    ),
    tool(
      {
        name: "create_deal",
        description: "Open a deal with a company. The caller becomes the owner.",
        readOnly: false,
        input: Schema.Struct({
          name: Schema.String,
          company_id: CompanyId,
          stage: Schema.optional(Schema.String).annotate({ description: STAGE_HELP }),
          amount: Text("Amount, such as 186000."),
          currency: Schema.optional(Schema.String).annotate({
            description: "ISO code; USD by default.",
          }),
          expected_close_date: Text("Expected close date, YYYY-MM-DD."),
        }),
      },
      (input) => {
        const id = createId(ID_PREFIXES.deal);

        return run(
          deps.records.deals.create(actor, { ...input, id }).pipe(Effect.as({ id, created: true })),
        );
      },
    ),
    tool(
      {
        name: "update_deal",
        description:
          "Change a deal: its stage, amount, close date, owner or description. Moving to closed_lost or unqualified_to_buy needs `closed_reason`.",
        readOnly: false,
        input: Schema.Struct({
          id: DealId,
          name: Schema.optional(Schema.String),
          stage: Schema.optional(Schema.String).annotate({ description: STAGE_HELP }),
          closed_reason: Text("Why the deal was lost or unqualified."),
          amount: Text("Amount, such as 186000."),
          currency: Text("ISO currency code."),
          expected_close_date: Text("Expected close date, YYYY-MM-DD."),
          description: Text("Where the deal stands, in a few sentences."),
          owner_id: OwnerId,
          archived: Schema.optional(Schema.Boolean),
        }),
      },
      ({ id, ...patch }) =>
        run(deps.records.deals.update(actor, id, patch).pipe(Effect.as({ id, updated: true }))),
    ),
    tool(
      {
        name: "add_deal_contact",
        description: "Put a contact on a deal, with their role such as Champion or Economic buyer.",
        readOnly: false,
        input: Schema.Struct({ deal_id: DealId, contact_id: ContactId, role: Text("Their role.") }),
      },
      (input) =>
        run(
          deps.records.deals
            .attachContact(actor, input.deal_id, input.contact_id, input.role)
            .pipe(Effect.as({ added: true })),
        ),
    ),
    tool(
      {
        name: "log_activity",
        description: `Log a ${LOGGED_ACTIVITY_TYPES.join(", ")} on a company, contact or deal. Tasks can have a due time.`,
        readOnly: false,
        input: Schema.Struct({
          type: Schema.String.annotate({ description: LOGGED_ACTIVITY_TYPES.join(", ") }),
          subject: Text("Short title."),
          body: Text("The note or summary, in the member's words."),
          due_at: Text("Tasks: ISO due time."),
          company_id: Schema.optional(Schema.NullOr(CompanyId)),
          contact_id: Schema.optional(Schema.NullOr(ContactId)),
          deal_id: Schema.optional(Schema.NullOr(DealId)),
        }),
      },
      (input) => {
        const id = createId(ID_PREFIXES.activity);

        return run(
          deps.records.activities
            .create(actor, { ...input, id })
            .pipe(Effect.as({ id, logged: true })),
        );
      },
    ),
    tool(
      {
        name: "list_members",
        description:
          "The people in this CRM workspace: user id, name, email and role. Use the id as an owner.",
        readOnly: true,
        input: Schema.Struct({}),
      },
      async () => answer({ members: await deps.directory.members(caller.workspaceId) }),
    ),
    tool(
      {
        name: "search_memory",
        description:
          "Search what the CRM remembers: research, members' notes, past chats and sent emails. Pass contactId, dealId or companyId to search that record. Without an id this searches only workspace memory, not all records; a name in the query does not choose a record. No matches does not mean the record has no facts: get_contact and get_deal include saved knowledge without a relevance filter.",
        readOnly: true,
        input: Schema.Struct({ query: Schema.String, ...MemoryTarget }),
      },
      async (input) => fromAgent(await deps.memory.search(caller, input), {}),
    ),
    tool(
      {
        name: "remember",
        description:
          "Save one lasting fact the member told you or asked you to remember, in their words. Pass `replaces` with a fact id when it corrects that fact. Never save secrets or private personal data.",
        readOnly: false,
        input: Schema.Struct({
          text: Schema.String,
          ...MemoryTarget,
          replaces: Schema.optional(Schema.String).annotate({
            description: "The id of a fact this one makes out of date.",
          }),
        }),
      },
      async (input) => {
        // A fact about a person or a deal belongs on that record.
        if (input.contactId || input.dealId) {
          const record = input.contactId
            ? await deps.directory.contact(caller.workspaceId, input.contactId)
            : await deps.directory.deal(caller.workspaceId, input.dealId ?? "");

          return fromAgent(await deps.memory.remember(caller, { ...input, kind: "agent_fact" }), {
            saved: true,
            savedTo: record?.name ?? "the record",
            note: "Facts appear in memory a few seconds after saving.",
          });
        }

        // A fact about a company belongs on that company: when the agent gives none, the fact
        // goes to the one it names, or the one Jev judges it is about.
        const companyId =
          input.companyId ??
          (await factSubject(
            input.text,
            await deps.directory.companies(caller.workspaceId, "", 500),
            deps.jev,
            AbortSignal.timeout(SUBJECT_WAIT_MS),
          )) ??
          undefined;

        const company = companyId
          ? await deps.directory.company(caller.workspaceId, companyId)
          : null;

        return fromAgent(
          await deps.memory.remember(caller, { ...input, companyId, kind: "agent_fact" }),
          {
            saved: true,
            savedTo: company ? company.name : "the workspace",
            note: "Facts appear in memory a few seconds after saving.",
          },
        );
      },
    ),
    tool(
      {
        name: "forget",
        description: "Forget one remembered fact by its id, when the member says it is wrong.",
        readOnly: false,
        destructive: true,
        input: Schema.Struct({ factId: Schema.String, ...MemoryTarget }),
      },
      async (input) => fromAgent(await deps.memory.forget(caller, input), { forgotten: true }),
    ),
    ...(deps.intel ? intelTools(deps.intel, caller, deps.memory) : []),
    ...(deps.fields ? fieldTools(deps.fields, caller) : []),
  ];
}

/** The CRM tools for a gateway caller; tests provide `CrmTools.of(...)` with fakes. */
export class CrmTools extends Context.Service<
  CrmTools,
  { readonly forCaller: (caller: EnrichmentToolCaller) => readonly LocalTool[] }
>()("@crm/api/services/CrmTools") {
  static readonly layer = Layer.effect(
    CrmTools,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const pool = yield* Postgres;
      const enrichment = yield* Enrichment;

      const deps: CrmToolDeps = {
        directory: postgresDirectory(pool),
        companies: yield* Companies,
        records: yield* Records,
        memory: (yield* Memory).agent,
        web: yield* Brand,
        jev: Option.isSome(config.aiGatewayApiKey) ? gatewayJev() : null,
        intel: yield* Intel,
        fields: yield* Fields,
        enrichment: enrichment
          ? {
              enrichment,
              matches: pgContactMatches((sql, params) => pool.query(sql, [...params])),
            }
          : null,
      };

      return { forCaller: (caller) => crmTools(deps, caller) };
    }),
  ).pipe(
    Layer.provide([
      Postgres.layer,
      Companies.layer,
      Records.layer,
      Memory.layer,
      Intel.layer,
      Fields.layer,
      Enrichment.layer,
      Brand.layer,
    ]),
  );
}
