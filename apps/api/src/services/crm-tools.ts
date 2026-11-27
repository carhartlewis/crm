import { createId, ID_PREFIXES } from "@crm/core/ids";
import type { LocalTool } from "@crm/integrations/gateway";
import { Context, Effect, Exit, Layer, Option, Schema } from "effect";
import { Companies, type CompaniesService } from "./Companies.ts";
import { postgresDirectory } from "./crm-directory.ts";
import { type AgentCaller, type AgentResult, Memory, type MemoryService } from "./Memory.ts";
import { Postgres } from "./Postgres.ts";

/**
 * The CRM's own tools on the MCP gateway (ADR 0018): the agent reaches companies, members and
 * memory the same way as connected apps, as `crm__<tool>`. Each runs as the caller in the
 * workspace their token names. Reads carry `readOnlyHint`; the agent asks before any other.
 */

export interface DirectoryCompany {
  readonly id: string;
  readonly name: string;
  readonly domain: string | null;
  readonly ownerName: string | null;
  readonly createdAt: string;
}

export interface DirectoryMember {
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
  members(workspaceId: string): Promise<readonly DirectoryMember[]>;
}

export interface CrmToolDeps {
  readonly directory: CrmDirectory;
  readonly companies: CompaniesService;
  readonly memory: Pick<MemoryService["agent"], "search" | "remember" | "forget">;
}

/** The tool's answer: JSON the model reads. A type alias: MCP results need an index signature. */
type ToolResult = {
  isError?: boolean;
  content: [{ type: "text"; text: string }];
};

const answer = <T>(value: T): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const refuse = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

const fromAgent = <T, D>(result: AgentResult<T>, done: D) =>
  result.ok ? answer(result.value ?? done) : refuse(result.message);

/** The first failure's message, as the model should read it. */
async function run<A>(effect: Effect.Effect<A, { readonly message: string }>) {
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

/** One tool: its MCP definition, and a call that decodes its arguments first. */
function tool<S extends Schema.Top & { readonly DecodingServices: never }>(
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
    description: "The company the memory is about. Leave it out for the workspace's own company.",
  }),
};

/** The caller's tools. `caller` comes from a verified token (OAuth MCP or agent token). */
export function crmTools(deps: CrmToolDeps, caller: AgentCaller): readonly LocalTool[] {
  const actor = { userId: caller.userId, activeWorkspaceId: caller.workspaceId };

  return [
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
        description: "One company in the CRM: name, domain, owner and when it was added.",
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
        description: "Rename a company or change its domain. Leave out what stays the same.",
        readOnly: false,
        input: Schema.Struct({
          id: CompanyId,
          name: Schema.optional(Schema.String),
          domain: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      },
      (input) =>
        run(
          deps.companies
            .update(actor, input.id, { name: input.name, domain: input.domain })
            .pipe(Effect.as({ id: input.id, updated: true })),
        ),
    ),
    tool(
      {
        name: "list_members",
        description: "The people in this CRM workspace: name, email and role.",
        readOnly: true,
        input: Schema.Struct({}),
      },
      async () => answer({ members: await deps.directory.members(caller.workspaceId) }),
    ),
    tool(
      {
        name: "search_memory",
        description:
          "Search what the CRM remembers: website research, members' notes, past chats and sent emails. Search one company, or the workspace's own company.",
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
      async (input) =>
        fromAgent(await deps.memory.remember(caller, { ...input, kind: "agent_fact" }), {
          saved: true,
          note: "Facts appear in memory a few seconds after saving.",
        }),
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
  ];
}

/** The CRM tools for a gateway caller; tests provide `CrmTools.of(...)` with fakes. */
export class CrmTools extends Context.Service<
  CrmTools,
  { readonly forCaller: (caller: AgentCaller) => readonly LocalTool[] }
>()("@crm/api/services/CrmTools") {
  static readonly layer = Layer.effect(
    CrmTools,
    Effect.gen(function* () {
      const deps: CrmToolDeps = {
        directory: postgresDirectory(yield* Postgres),
        companies: yield* Companies,
        memory: (yield* Memory).agent,
      };

      return { forCaller: (caller) => crmTools(deps, caller) };
    }),
  ).pipe(Layer.provide([Postgres.layer, Companies.layer, Memory.layer]));
}
