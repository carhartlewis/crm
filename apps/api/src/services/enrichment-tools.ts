import {
  cleanDomain,
  cleanEmail,
  cleanText,
  companyProfile,
  companyRows,
  type EnrichmentContract,
  emailVerdict,
  FAILURE_MESSAGES,
  linkedinProfileUrl,
  peopleRows,
  type PersonRow,
  personProfile,
  phoneType,
  phoneVerdict,
  type TregBody,
  TregError,
} from "@crm/core/enrichment";
import type { WebReader } from "@crm/core/brand";
import { contactPhotoSource } from "@crm/core/storage";
import type { CallUsage, UsageOrigin } from "@crm/core/usage";
import type { LocalTool } from "@crm/integrations/gateway";
import { Option, Schema } from "effect";
import { answer, refuse, type ToolResult, tool } from "./crm-tools.ts";
import {
  type EnrichmentCaller,
  type EnrichmentRequest,
  type EnrichmentResult,
  type EnrichmentService,
  NotAMember,
} from "./Enrichment.ts";
import type { AgentCaller } from "./Memory.ts";

/**
 * People and company enrichment tools on the gateway (ADR 0027). Each relays one treg contract
 * through the Enrichment service, which files what it cost under the workspace, and answers with
 * the result in one shape plus its `usage` (the chat shows the price next to the step). They
 * read only, so they run in every permission mode; the agent decides what a result means.
 */

/** The gateway caller, with what runs the turn and its record when an agent token said so. */
export type EnrichmentToolCaller = AgentCaller & {
  readonly origin?: UsageOrigin;
  readonly record?: { readonly kind: string; readonly id: string } | null;
};

export interface CrmMatch {
  readonly contactId: string;
  readonly email: string | null;
  readonly linkedinUrl: string | null;
}

export interface EnrichmentToolDeps {
  readonly enrichment: EnrichmentService;
  /** context.dev, the photo fallback when a profile has none. */
  readonly web: WebReader | null;
  /** The workspace's contacts that already have one of these emails or LinkedIn URLs. */
  readonly matches: (
    workspaceId: string,
    emails: readonly string[],
    linkedinUrls: readonly string[],
  ) => Promise<readonly CrmMatch[]>;
}

/** The most rows one search may ask for: search is billed per row. */
export const SEARCH_LIMIT = 50;

const Text = (description: string) =>
  Schema.optional(Schema.NullOr(Schema.String)).annotate({ description });

const Limit = Schema.optional(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SEARCH_LIMIT })),
);

const Identity = {
  email: Text("A work email."),
  linkedin_url: Text("Their LinkedIn profile URL (linkedin.com/in/…)."),
  full_name: Text("Their full name; pair it with `domain`."),
  domain: Text("Their company's website domain, such as acme.com."),
};

interface IdentityInput {
  readonly email?: string | null | undefined;
  readonly linkedin_url?: string | null | undefined;
  readonly full_name?: string | null | undefined;
  readonly domain?: string | null | undefined;
}

/** A person's identity as treg takes it, normalised so one person is one cached question. */
function identity(input: IdentityInput) {
  return {
    email: cleanEmail(input.email) ?? undefined,
    linkedin_url: linkedinProfileUrl(input.linkedin_url) ?? undefined,
    full_name: cleanText(input.full_name, 160) ?? undefined,
    domain: cleanDomain(input.domain) ?? undefined,
  } satisfies TregBody;
}

type Identity = ReturnType<typeof identity>;

const enough = (body: Identity) =>
  Boolean(body.email || body.linkedin_url || (body.full_name && body.domain));

const NOT_ENOUGH =
  "Give a work email, a LinkedIn profile URL, or a full name with the company's domain.";

const nothing = (usage: CallUsage, note: string) => ({ found: false, note, usage });

/** Trimmed text, or undefined so it isn't sent. */
const given = (value: string | null | undefined) => value?.trim() || undefined;

/** A failure as a short refusal the model reads (never treg's body). */
function failed(error: Error): ToolResult {
  if (error instanceof TregError) return refuse(FAILURE_MESSAGES[error.reason]);

  if (error instanceof NotAMember) return refuse("You are not a member of this workspace.");

  return refuse("The lookup failed. Try again later.");
}

export function enrichmentTools(
  deps: EnrichmentToolDeps,
  gatewayCaller: EnrichmentToolCaller,
): readonly LocalTool[] {
  const caller: EnrichmentCaller = {
    userId: gatewayCaller.userId,
    workspaceId: gatewayCaller.workspaceId,
    origin: gatewayCaller.origin ?? "chat",
    record: gatewayCaller.record ?? null,
  };

  /** One call, answered by `reply`; any failure becomes a refusal. */
  const relay = async <C extends EnrichmentContract, R>(
    request: EnrichmentRequest<C>,
    reply: (result: EnrichmentResult<C>) => R | Promise<R>,
  ): Promise<ToolResult> => {
    try {
      return answer(await reply(await deps.enrichment.call(caller, request)));
    } catch (error) {
      return failed(error instanceof Error ? error : new Error("lookup failed"));
    }
  };

  /** Marks rows already in the CRM, so the agent and the chat don't add them twice. */
  const withCrm = async (rows: readonly PersonRow[]) => {
    const emails = rows.flatMap((row) => (row.email ? [row.email] : []));
    const linkedinUrls = rows.flatMap((row) => (row.linkedinUrl ? [row.linkedinUrl] : []));

    const found =
      emails.length + linkedinUrls.length > 0
        ? await deps.matches(caller.workspaceId, emails, linkedinUrls)
        : [];

    return rows.map((row) => ({
      ...row,
      contactId:
        found.find(
          (contact) =>
            (row.email !== null && contact.email === row.email) ||
            (row.linkedinUrl !== null && contact.linkedinUrl === row.linkedinUrl),
        )?.contactId ?? null,
    }));
  };

  return [
    tool(
      {
        name: "find_people",
        description: `Find people by a description, or at a company. Use \`q\` for a brief in words ("heads of finance at Series B fintechs in London"), \`company_domain\` for everyone at a company (with \`title\` for one role there), or \`full_name\` for one person. Rows are directory listings: check each row's title, company and summary against the brief and drop the ones that don't fit, and verify an email before anyone writes to it. \`contactId\` is set when the person is already in the CRM. Billed per row, so ask for about 1.5× the people you need (at most ${SEARCH_LIMIT}); pass \`cursor\` for more.`,
        readOnly: true,
        input: Schema.Struct({
          q: Text("The people in words: role, seniority, industry, place, audience."),
          company_domain: Text("Their employer's domain, such as stripe.com."),
          title: Text("A job title, such as Head of Tax."),
          full_name: Text("One person's name."),
          country: Text("An ISO country code, such as GB."),
          location: Text("A place spelled out, such as 'London, United Kingdom'."),
          keywords: Schema.optional(Schema.Array(Schema.String)).annotate({
            description: "Skills or topics the person must match.",
          }),
          limit: Limit,
          cursor: Text("The previous answer's nextCursor, for the next page."),
        }),
      },
      async (input) => {
        const body = {
          q: given(input.q),
          company_domain: cleanDomain(input.company_domain) ?? undefined,
          title: given(input.title),
          full_name: given(input.full_name),
          country: given(input.country),
          location: given(input.location),
          cursor: given(input.cursor),
          keywords: input.keywords?.length ? input.keywords.slice(0, 10) : undefined,
          limit: input.limit ?? 15,
        } satisfies TregBody;

        if (!body.q && !body.company_domain && !body.title && !body.full_name) {
          return refuse("Describe the people (q), or give a company domain, a title or a name.");
        }

        return relay({ contract: "people.search", body }, async ({ answer: found, usage }) => {
          const people = await withCrm(peopleRows(found.output));

          return {
            count: people.length,
            people,
            nextCursor: cleanText(found.output?.next_cursor, 2000),
            usage,
          };
        });
      },
    ),
    tool(
      {
        name: "find_email",
        description:
          "Find someone's work email from their full name and company domain, or their LinkedIn URL. The address is checked in the same call: `status` is valid (accepts mail), catch_all (the domain accepts any address), risky, unknown or invalid. To save it on a contact, record it as an `email` fact; the CRM keeps only checked addresses.",
        readOnly: true,
        input: Schema.Struct({
          full_name: Text("Their full name."),
          domain: Text("Their company's website domain, such as acme.com."),
          linkedin_url: Text("Their LinkedIn profile URL."),
        }),
      },
      async (input) => {
        const body = identity(input);

        if (!body.linkedin_url && !(body.full_name && body.domain)) {
          return refuse("Give a full name with the company's domain, or a LinkedIn URL.");
        }

        return relay(
          { contract: "people.email.find", body: { ...body, email: undefined }, verify: true },
          ({ answer: found, usage }) => {
            const email = cleanEmail(found.output?.email);

            if (!email) return nothing(usage, "No work email was found.");

            return {
              found: true,
              email,
              status: found.check ? emailVerdict(found.check.verdict) : "unknown",
              // A LinkedIn-only source can return a former employer's address.
              sameDomain: found.domainMatch,
              usage,
            };
          },
        );
      },
    ),
    tool(
      {
        name: "verify_email",
        description:
          "Check whether an email address accepts mail: `status` is valid, catch_all, risky, unknown or invalid. Use it before anyone writes to an address that wasn't checked.",
        readOnly: true,
        input: Schema.Struct({ email: Schema.String }),
      },
      async (input) => {
        const email = cleanEmail(input.email);

        if (!email) return refuse("Give a full email address.");

        return relay(
          { contract: "people.email.verify", body: { email } },
          ({ answer: found, usage }) => ({
            email,
            status: emailVerdict(found.output?.status),
            usage,
          }),
        );
      },
    ),
    tool(
      {
        name: "find_phone",
        description:
          "Find someone's phone number from their LinkedIn URL (best), work email, or full name with company domain. The line is checked in the same call: `status` is live, dead or unchecked (no country code). To save it on a contact, record it as a `phone` fact with its `type`.",
        readOnly: true,
        input: Schema.Struct(Identity),
      },
      async (input) => {
        const body = identity(input);

        if (!enough(body)) return refuse(NOT_ENOUGH);

        return relay(
          { contract: "people.phone.find", body, verify: true },
          ({ answer: found, usage }) => {
            const phone = cleanText(found.output?.phone, 40);

            if (!phone) return nothing(usage, "No phone number was found.");

            return {
              found: true,
              phone,
              status: phoneVerdict(found.check),
              type: phoneType(found.output?.line_type),
              usage,
            };
          },
        );
      },
    ),
    tool(
      {
        name: "enrich_person",
        description:
          "Look a person up from their work email, LinkedIn URL, or full name with company domain: name, title, employer and its domain, location and LinkedIn URL. Use the result only when the employer fits what the CRM knows.",
        readOnly: true,
        input: Schema.Struct(Identity),
      },
      async (input) => {
        const body = identity(input);

        if (!enough(body)) return refuse(NOT_ENOUGH);

        return relay({ contract: "people.enrich", body }, ({ answer: found, usage }) => {
          const person = personProfile(found);

          return person
            ? { found: true, ...person, usage }
            : nothing(usage, "No profile was found.");
        });
      },
    ),
    tool(
      {
        name: "linkedin_profile",
        description:
          "Read a LinkedIn member's public profile from their profile URL: name, headline, location, about, and their photo (`photoUrl`) when the profile has one.",
        readOnly: true,
        input: Schema.Struct({ linkedin_url: Schema.String }),
      },
      async (input) => {
        const linkedin = linkedinProfileUrl(input.linkedin_url);

        if (!linkedin) return refuse("Give a LinkedIn profile URL (linkedin.com/in/…).");

        return relay(
          {
            contract: "linkedin.user.profile",
            body: { linkedin_url: linkedin },
            prefer: ["brightdata"],
          },
          ({ answer: found, usage }) => {
            const person = personProfile(found);

            return person
              ? { found: true, ...person, linkedinUrl: person.linkedinUrl ?? linkedin, usage }
              : nothing(usage, "The profile couldn't be read.");
          },
        );
      },
    ),
    tool(
      {
        name: "find_photo",
        description:
          "Find a person's photo: from their LinkedIn profile first, then from public profile data. Pass their LinkedIn URL (best), work email, and name with company domain. Record the `photoUrl` as an `image_url` fact; it is copied into the CRM.",
        readOnly: true,
        input: Schema.Struct(Identity),
      },
      async (input) => {
        const body = identity(input);
        let usage: CallUsage | null = null;

        if (body.linkedin_url) {
          try {
            const result = await deps.enrichment.call(caller, {
              contract: "linkedin.user.profile",
              body: { linkedin_url: body.linkedin_url },
              prefer: ["brightdata"],
            });

            usage = result.usage;

            if (result.answer.photoUrl) {
              return answer({
                found: true,
                photoUrl: result.answer.photoUrl,
                source: "LinkedIn profile",
                usage,
              });
            }
          } catch (error) {
            if (error instanceof NotAMember) return failed(error);
            // Otherwise public profile data may still have a photo.
          }
        }

        const [first = "", ...rest] = (body.full_name ?? "").split(/\s+/);

        const person = deps.web
          ? await deps.web
              .findPerson({
                email: body.email ?? null,
                profileUrls: body.linkedin_url ? [body.linkedin_url] : [],
                firstName: first || null,
                lastName: rest.join(" ") || null,
                companyDomain: body.domain ?? null,
              })
              .catch(() => null)
          : null;

        const photoUrl = person?.avatarUrl ? contactPhotoSource(person.avatarUrl) : null;

        return answer(
          photoUrl
            ? { found: true, photoUrl, source: "public profile data", usage }
            : { found: false, note: "No photo was found.", usage },
        );
      },
    ),
    tool(
      {
        name: "enrich_company",
        description:
          "Look a company up from its domain (best), name or LinkedIn URL: description, industry, headcount, founded year, location and LinkedIn URL.",
        readOnly: true,
        input: Schema.Struct({
          domain: Text("Such as acme.com."),
          name: Text("Its name, when there is no domain."),
          linkedin_url: Text("Its LinkedIn company page."),
        }),
      },
      async (input) => {
        const domain = cleanDomain(input.domain);
        const linkedin = given(input.linkedin_url);

        // The best identity only: one company is one cached question.
        const body = {
          domain: domain ?? undefined,
          linkedin_url: domain ? undefined : linkedin,
          name: domain || linkedin ? undefined : given(input.name),
        } satisfies TregBody;

        if (!body.domain && !body.linkedin_url && !body.name) {
          return refuse("Give the company's domain, name or LinkedIn page.");
        }

        return relay({ contract: "companies.enrich", body }, ({ answer: found, usage }) => {
          const company = companyProfile(found.output);

          return company
            ? { found: true, ...company, usage }
            : nothing(usage, "No company profile was found.");
        });
      },
    ),
    tool(
      {
        name: "find_companies",
        description:
          "Find companies by a description in words, a name, an industry, a technology they use, or a domain. Billed per row.",
        readOnly: true,
        input: Schema.Struct({
          q: Text("The companies in words."),
          name: Text("A company name."),
          industry: Text("Such as Fintech."),
          technology: Text("A technology they use, such as Snowflake."),
          domain: Text("A domain."),
          country: Text("An ISO country code."),
          limit: Limit,
        }),
      },
      async (input) => {
        const body = {
          q: given(input.q),
          name: given(input.name),
          industry: given(input.industry),
          technology: given(input.technology),
          domain: cleanDomain(input.domain) ?? undefined,
          country: given(input.country),
          limit: input.limit ?? 10,
        } satisfies TregBody;

        if (!body.q && !body.name && !body.industry && !body.technology && !body.domain) {
          return refuse("Describe the companies or give a name, industry, technology or domain.");
        }

        return relay({ contract: "companies.search", body }, ({ answer: found, usage }) => {
          const companies = companyRows(found.output);

          return { count: companies.length, companies, usage };
        });
      },
    ),
    tool(
      {
        name: "similar_companies",
        description: "Find companies like one you know, from its domain.",
        readOnly: true,
        input: Schema.Struct({ domain: Schema.String }),
      },
      async (input) => {
        const domain = cleanDomain(input.domain);

        if (!domain) return refuse("Give a domain, such as acme.com.");

        return relay(
          { contract: "companies.similar", body: { domain } },
          ({ answer: found, usage }) => {
            const companies = companyRows(found.output);

            return { count: companies.length, companies, usage };
          },
        );
      },
    ),
  ];
}

const MatchRow = Schema.Struct({
  id: Schema.String,
  email: Schema.NullOr(Schema.String),
  linkedin_url: Schema.NullOr(Schema.String),
});

const decodeMatches = Schema.decodeUnknownOption(Schema.Array(MatchRow));

/** Contacts in a workspace with one of these emails or LinkedIn URLs, from Postgres. */
export function pgContactMatches(
  query: (
    sql: string,
    params: readonly (string | readonly string[])[],
  ) => Promise<{ rows: unknown[] }>,
): EnrichmentToolDeps["matches"] {
  return async (workspaceId, emails, linkedinUrls) => {
    const result = await query(
      `SELECT id, email, linkedin_url FROM contact
        WHERE workspace_id = $1 AND archived_at IS NULL
          AND (lower(email) = ANY($2::text[]) OR linkedin_url = ANY($3::text[]))`,
      [workspaceId, emails.map((email) => email.toLowerCase()), linkedinUrls],
    );

    return Option.getOrElse(decodeMatches(result.rows), () => []).map((row) => ({
      contactId: row.id,
      email: row.email?.toLowerCase() ?? null,
      linkedinUrl: linkedinProfileUrl(row.linkedin_url),
    }));
  };
}
