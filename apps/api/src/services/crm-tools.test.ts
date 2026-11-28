import { describe, expect, test } from "bun:test";
import type { LocalTool } from "@crm/integrations/gateway";
import { makeCompanies } from "./Companies.ts";
import { makeRecords } from "./Records.ts";
import { createMemoryCompanyStore } from "./record-store-memory.ts";
import { agentContext, type CrmDirectory, type CrmToolDeps, crmTools } from "./crm-tools.ts";

const caller = { userId: "user_ana", workspaceId: "ws_a" };

const directory: CrmDirectory = {
  companies: async (workspaceId, query) =>
    workspaceId === "ws_a" && "acme".includes(query.toLowerCase())
      ? [
          {
            id: "com_1",
            name: "Acme",
            domain: "acme.com",
            industry: null,
            location: null,
            description: null,
            ownerName: "Ana",
            contacts: 0,
            openDeals: 0,
            lastActivityAt: null,
            createdAt: "2026-11-26T00:00:00.000Z",
          },
        ]
      : [],
  company: async () => null,
  contacts: async () => [],
  contact: async () => null,
  deals: async () => [],
  deal: async () => null,
  members: async () => [{ id: "user_ana", name: "Ana", email: "ana@example.com", role: "owner" }],
  workspace: async (workspaceId) =>
    workspaceId === "ws_a" ? { name: "Comp AI", website: "trycomp.ai" } : null,
};

const memoryCalls: string[] = [];

const memory: CrmToolDeps["memory"] = {
  knowledge: async () => ({
    ok: true,
    value: { enabled: true, profile: [], facts: [], sources: [] },
  }),
  search: async (who, input) => {
    memoryCalls.push(`search ${who.workspaceId} ${input.query}`);

    return { ok: true, value: [] };
  },
  remember: async (who, input) => {
    memoryCalls.push(`remember ${who.workspaceId} ${input.companyId ?? "workspace"}`);

    return { ok: true, value: null };
  },
  forget: async () => ({ ok: false, status: 404, message: "No such fact" }),
  research: async () => ({ ok: true, value: null }),
};

function setup(overrides: Partial<CrmToolDeps> = {}) {
  const store = createMemoryCompanyStore(["ws_a:user_ana"]);

  return {
    store,
    tools: crmTools(
      {
        directory,
        companies: makeCompanies(store.store),
        records: makeRecords(store.store),
        memory,
        web: null,
        jev: null,
        ...overrides,
      },
      caller,
    ),
  };
}

const byName = (tools: readonly LocalTool[], name: string) => {
  const found = tools.find((entry) => entry.tool.name === `crm__${name}`);

  if (!found) throw new Error(`no tool ${name}`);

  return found;
};

const text = (result: { content: unknown }) =>
  // SAFETY: every CRM tool answers with one text part.
  (result.content as [{ text: string }])[0].text;

describe("agent context", () => {
  test("names the member and their workspace", async () => {
    expect(await agentContext(directory, caller)).toEqual({
      workspace: { name: "Comp AI", website: "trycomp.ai" },
      member: { id: "user_ana", name: "Ana", email: "ana@example.com", role: "owner" },
    });
  });

  test("is null for someone outside the workspace", async () => {
    expect(await agentContext(directory, { ...caller, userId: "user_bob" })).toBeNull();
    expect(await agentContext(directory, { ...caller, workspaceId: "ws_b" })).toBeNull();
  });
});

describe("CRM tools", () => {
  test("reads are marked read-only, writes are not, and forget is destructive", () => {
    const { tools } = setup();

    const hints = Object.fromEntries(
      tools.map((entry) => [entry.tool.name, entry.tool.annotations]),
    );

    expect(hints["crm__list_companies"]?.readOnlyHint).toBe(true);
    expect(hints["crm__create_company"]?.readOnlyHint).toBe(false);
    expect(hints["crm__forget"]?.destructiveHint).toBe(true);
    expect(byName(tools, "list_companies").tool.inputSchema.type).toBe("object");
  });

  test("lists the caller's workspace companies", async () => {
    const result = await byName(setup().tools, "list_companies").call({ query: "ac" });

    expect(JSON.parse(text(result)).companies[0].name).toBe("Acme");
  });

  test("creates a company as the caller, through the shared rules", async () => {
    const { tools, store } = setup();

    const created = await byName(tools, "create_company").call({
      name: "  Globex ",
      domain: "https://globex.com",
    });

    expect(created.isError).toBeUndefined();
    expect([...store.rows().values()]).toMatchObject([
      { name: "Globex", domain: "globex.com", ownerId: "user_ana", workspaceId: "ws_a" },
    ]);

    const invalid = await byName(tools, "create_company").call({ name: "" });

    expect(invalid.isError).toBe(true);
  });

  test("never adds a person without their company", async () => {
    const { tools } = setup();

    const results = await Promise.all([
      byName(tools, "create_contact").call({ first_name: "David" }),
      byName(tools, "create_contact").call({ first_name: "David", company_id: null }),
      byName(tools, "update_contact").call({ id: "ctc_x", company_id: null }),
    ]);

    expect(results.map((result) => result.isError)).toEqual([true, true, true]);
  });

  test("refuses input that doesn't match the schema", async () => {
    expect((await byName(setup().tools, "get_company").call({ id: 4 })).isError).toBe(true);
  });

  test("memory tools act in the caller's workspace and pass failures on", async () => {
    const { tools } = setup();

    await byName(tools, "search_memory").call({ query: "renewal" });

    expect(memoryCalls).toContain("search ws_a renewal");
    expect(text(await byName(tools, "forget").call({ factId: "f1" }))).toBe("No such fact");
  });

  test.each(["contact", "deal"] as const)(
    "reading a %s includes its own saved knowledge and preserves memory failures",
    async (kind) => {
      const record = {
        id: kind === "contact" ? "ctc_1" : "del_1",
        name: "Acme record",
        title: null,
        email: null,
        phone: null,
        companyId: "com_1",
        companyName: "Acme",
        ownerName: "Ana",
        lastActivityAt: null,
        stage: "new",
        amount: null,
        currency: "USD",
        expectedCloseDate: null,
        description: null,
        closedReason: null,
      };

      const knowledge = {
        ok: true as const,
        value: {
          enabled: true,
          profile: [{ id: "f1", text: "Prefers email." }],
          facts: [],
          sources: [],
        },
      };

      const failure = { ok: false as const, status: 502 as const, message: "Memory unavailable." };
      const requests: unknown[] = [];

      await Promise.all(
        [knowledge, failure].map(async (result) => {
          const { tools } = setup({
            directory: {
              ...directory,
              contact: async () => record,
              deal: async () => record,
            },
            memory: {
              ...memory,
              knowledge: async (who, target) => {
                requests.push({ who, target });

                return result;
              },
            },
          });

          const response = await byName(tools, `get_${kind}`).call({ id: record.id });

          expect(response.isError).toBeUndefined();
          expect(JSON.parse(text(response))).toMatchObject({ id: record.id, memory: result });
        }),
      );

      expect(requests).toEqual(
        [knowledge, failure].map(() => ({
          who: caller,
          target: kind === "contact" ? { contactId: record.id } : { dealId: record.id },
        })),
      );

      const { tools } = setup({
        memory: {
          ...memory,
          knowledge: async () => {
            throw new Error("A missing record must not read memory");
          },
        },
      });

      expect((await byName(tools, `get_${kind}`).call({ id: record.id })).isError).toBe(true);
    },
  );

  test("a fact the agent saves without a company goes to the company it names", async () => {
    const remember = byName(setup().tools, "remember");

    memoryCalls.length = 0;
    await remember.call({ text: "Acme renewed SOC 2 in September" });
    await remember.call({ text: "We moved our office" });

    expect(memoryCalls).toEqual(["remember ws_a com_1", "remember ws_a workspace"]);
  });

  test("context.dev tools appear only with a key, and read what the agent asks", async () => {
    expect(setup().tools.some((entry) => entry.tool.name === "crm__lookup_company")).toBe(false);

    const tools = crmTools(
      {
        directory,
        companies: makeCompanies(createMemoryCompanyStore([]).store),
        records: makeRecords(createMemoryCompanyStore([]).store),
        memory,
        jev: null,
        web: {
          lookup: async (query) =>
            "domain" in query ? { ...EMPTY_PROFILE, domain: query.domain, name: "Acme" } : null,
          readPage: async (url) => `# Page at ${url}`,
          findPerson: async () => null,
        },
      },
      caller,
    );

    expect(
      JSON.parse(text(await byName(tools, "lookup_company").call({ domain: "acme.com" }))),
    ).toMatchObject({ domain: "acme.com", name: "Acme" });
    expect((await byName(tools, "lookup_company").call({})).isError).toBe(true);
    expect(text(await byName(tools, "read_web_page").call({ url: "https://acme.com" }))).toContain(
      "# Page at https://acme.com",
    );
    expect(byName(tools, "read_web_page").tool.annotations?.readOnlyHint).toBe(true);
  });
});

const EMPTY_PROFILE = {
  domain: "",
  name: null,
  description: null,
  slogan: null,
  industries: [],
  address: null,
  socials: [],
  links: {},
  email: null,
  phone: null,
  stock: null,
};
