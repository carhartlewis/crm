import { describe, expect, test } from "bun:test";
import { createTreg } from "@crm/core/enrichment";
import { createId } from "@crm/core/ids";
import { createMemoryKv } from "@crm/core/kv";
import type { LocalTool } from "@crm/integrations/gateway";
import { Effect } from "effect";
import { makeCompanies } from "./Companies.ts";
import { type CrmDirectory, crmTools } from "./crm-tools.ts";
import { makeEnrichment, type UsageRow } from "./Enrichment.ts";
import { makeIntel } from "./Intel.ts";
import { createMemoryIntelStore } from "./intel-store-memory.ts";
import { makeRecords } from "./Records.ts";
import { createMemoryCompanyStore } from "./record-store-memory.ts";
import { makeUsage, type UsageStore } from "./Usage.ts";

/**
 * People search end to end (ADR 0027): the agent finds people, adds one (research then starts by
 * itself), finds and records their checked email, and the month's usage adds up to what each
 * call reported. Real tools, enrichment, facts and usage; treg is a fake behind `fetch`.
 */

const caller = { userId: "user_ana", workspaceId: "ws_a", origin: "chat" as const };

// treg's answers per contract (2026-11-27 shapes, made-up people), with what each costs.
const TREG = new Map<string, { body: string; cost: number }>(
  Object.entries({
    "treg.people.search": {
      cost: 2600,
      body: JSON.stringify({
        output: {
          people: [
            {
              name: "Ada Park",
              title: "Founder & CEO",
              company: "Example Ventures",
              company_domain: "example-ventures.com",
              location: "Miami, FL, US",
              profile_url: "https://www.linkedin.com/in/ada-park",
            },
            {
              name: "Sam Lee",
              title: "Partner",
              company: "Example Ventures",
              company_domain: "example-ventures.com",
              profile_url: "https://www.linkedin.com/in/sam-lee",
            },
          ],
          count: 2,
        },
        _treg: { outcome: "hit" },
      }),
    },
    "treg.people.email.find": {
      cost: 4950,
      body: JSON.stringify({
        output: { email: "ada@example-ventures.com", verified: true },
        _treg: {
          outcome: "hit",
          domain_match: true,
          verification: { verdict: "valid", checked: true },
        },
      }),
    },
  }),
);

function setup() {
  const treg: string[] = [];
  const usage: UsageRow[] = [];
  const researched: string[] = [];
  const records = createMemoryCompanyStore(["ws_a:user_ana"]);

  // Sam is already in the CRM.
  const sam = { id: createId("ctc"), linkedinUrl: "https://www.linkedin.com/in/sam-lee" };

  const enrichment = makeEnrichment({
    treg: createTreg({
      token: "t",
      url: "https://treg.test",
      fetch: async (url) => {
        const contract = url.slice("https://treg.test/call/".length);
        const answer = TREG.get(contract);

        treg.push(contract);

        return answer
          ? new Response(answer.body, {
              headers: {
                "x-treg-cost-micro": String(answer.cost),
                "x-treg-call-id": `call_${treg.length}`,
              },
            })
          : new Response("{}", { status: 404 });
      },
    }),
    kv: createMemoryKv(),
    store: {
      isMember: async (workspaceId, userId) => workspaceId === "ws_a" && userId === "user_ana",
      markupBps: async () => 0,
      record: async (row) => {
        usage.push(row);
      },
    },
  });

  const intel = createMemoryIntelStore(["ws_a:user_ana"]);

  const facts = makeIntel(intel.store, {
    checks: {
      email: (actor, email) =>
        enrichment.emailStatus(
          { userId: actor.userId, workspaceId: actor.activeWorkspaceId ?? "", origin: "chat" },
          email,
        ),
      phone: (phone) => enrichment.phoneStatus(phone),
    },
  });

  const tools = crmTools(
    {
      directory: EMPTY_DIRECTORY,
      companies: makeCompanies(records.store),
      records: makeRecords(records.store, undefined, undefined, {
        contactCreated: (_actor, id) => researched.push(id),
      }),
      memory: NO_MEMORY,
      web: null,
      jev: null,
      enrichment: {
        enrichment,
        matches: async (_workspaceId, _emails, linkedinUrls) =>
          linkedinUrls.includes(sam.linkedinUrl)
            ? [{ contactId: sam.id, email: null, linkedinUrl: sam.linkedinUrl }]
            : [],
      },
    },
    caller,
  );

  return { tools, treg, usage, researched, records, intel, facts, sam };
}

const byName = (tools: readonly LocalTool[], name: string) => {
  const found = tools.find((entry) => entry.tool.name === `crm__${name}`);

  if (!found) throw new Error(`no tool ${name}`);

  return found;
};

/** A tool's JSON answer. */
async function call(
  tools: readonly LocalTool[],
  name: string,
  input: Readonly<Record<string, string | boolean>>,
) {
  const result = await byName(tools, name).call(input);
  const [part] = result.content;

  return JSON.parse(part?.type === "text" ? part.text : "null");
}

/** A usage store over the rows the test's calls wrote. */
function ledger(rows: readonly UsageRow[]): UsageStore {
  return {
    role: async () => "owner",
    markupBps: async () => 0,
    grouped: async (_workspaceId, _range, by) => {
      const keyOf = (row: UsageRow) =>
        by === "day"
          ? "2026-11-27"
          : by === "member"
            ? row.userId
            : by === "origin"
              ? row.origin
              : row.contract;

      const keys = [...new Set(rows.map(keyOf))];

      return keys.map((key) => {
        const mine = rows.filter((row) => keyOf(row) === key);

        return {
          key,
          label: null,
          calls: mine.length,
          price: mine.reduce((sum, row) => sum + row.priceMicro, 0),
          cost: mine.reduce((sum, row) => sum + row.costMicro, 0),
        };
      });
    },
    rows: async () => [],
    record: async () => ({ calls: 0, price: 0 }),
  };
}

describe("people search, end to end", () => {
  test("find, add, enrich and bill", async () => {
    const env = setup();

    // 1. The search finds two people; Sam is already in the CRM.
    const found = await call(env.tools, "find_people", { company_domain: "example-ventures.com" });

    expect(found.people.map((row: { name: string }) => row.name)).toEqual(["Ada Park", "Sam Lee"]);
    expect(found.people[1].contactId).toBe(env.sam.id);
    expect(found.usage).toMatchObject({ priceMicro: 2600, outcome: "hit" });

    // 2. Adding Ada (at her company) files her as found by a search, and her research starts
    // by itself.
    const company = await call(env.tools, "create_company", {
      name: "Example Ventures",
      domain: "example-ventures.com",
    });

    const added = await call(env.tools, "create_contact", {
      company_id: company.id,
      first_name: "Ada",
      last_name: "Park",
      title: "Founder & CEO",
      linkedin_url: "https://www.linkedin.com/in/ada-park",
      found_by_search: true,
    });

    expect([...env.records.table("contact").values()]).toMatchObject([
      {
        id: added.id,
        firstName: "Ada",
        companyId: company.id,
        source: "search",
        linkedinUrl: "https://www.linkedin.com/in/ada-park",
      },
    ]);
    expect(env.researched).toEqual([added.id]);

    // 3. Her email is found and checked in one call; recording it needs no second check.
    const email = await call(env.tools, "find_email", {
      full_name: "Ada Park",
      domain: "example-ventures.com",
    });

    expect(email).toMatchObject({
      email: "ada@example-ventures.com",
      status: "valid",
      sameDomain: true,
    });

    env.intel.seed("contact", { id: added.id, workspaceId: "ws_a", source: "search" });

    const saved = await Effect.runPromise(
      env.facts.recordFact(
        { userId: "user_ana", activeWorkspaceId: "ws_a" },
        { contactId: added.id, field: "email", value: email.email, score: 0.5 },
      ),
    );

    expect(saved.outcome).toBe("applied");
    expect(env.intel.record("contact", added.id)).toMatchObject({ emailStatus: "valid" });
    expect(env.treg).toEqual(["treg.people.search", "treg.people.email.find"]);

    // 4. The month's usage is the sum of what each call reported.
    const summary = await Effect.runPromise(
      makeUsage(ledger(env.usage)).summary(
        { userId: "user_ana", activeWorkspaceId: "ws_a" },
        "2026-11",
      ),
    );

    expect(summary).toMatchObject({ calls: 2, priceMicro: 2600 + 4950, costMicro: 7550 });
    expect(summary.jobs.map((job) => job.label)).toEqual(["Find email", "Find people"]);
  });
});

const EMPTY_DIRECTORY: CrmDirectory = {
  companies: async () => [],
  company: async () => null,
  contacts: async () => [],
  contact: async () => null,
  deals: async () => [],
  deal: async () => null,
  members: async () => [],
  workspace: async () => null,
};

const NO_MEMORY = {
  knowledge: async () => ({
    ok: true as const,
    value: { enabled: true, profile: [], facts: [], sources: [] },
  }),
  search: async () => ({ ok: true as const, value: [] }),
  remember: async () => ({ ok: true as const, value: null }),
  forget: async () => ({ ok: true as const, value: null }),
  research: async () => ({ ok: true as const, value: null }),
};
