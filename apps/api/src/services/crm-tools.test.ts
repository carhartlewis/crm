import { describe, expect, test } from "bun:test";
import type { LocalTool } from "@crm/integrations/gateway";
import { makeCompanies } from "./Companies.ts";
import { createMemoryCompanyStore } from "./company-store-memory.ts";
import { type CrmDirectory, type CrmToolDeps, crmTools } from "./crm-tools.ts";

const caller = { userId: "user_ana", workspaceId: "ws_a" };

const directory: CrmDirectory = {
  companies: async (workspaceId, query) =>
    workspaceId === "ws_a" && "acme".includes(query.toLowerCase())
      ? [
          {
            id: "com_1",
            name: "Acme",
            domain: "acme.com",
            ownerName: "Ana",
            createdAt: "2026-11-26T00:00:00.000Z",
          },
        ]
      : [],
  company: async () => null,
  members: async () => [{ name: "Ana", email: "ana@example.com", role: "owner" }],
};

const memoryCalls: string[] = [];

const memory: CrmToolDeps["memory"] = {
  search: async (who, input) => {
    memoryCalls.push(`search ${who.workspaceId} ${input.query}`);

    return { ok: true, value: [] };
  },
  remember: async () => ({ ok: true, value: null }),
  forget: async () => ({ ok: false, status: 404, message: "No such fact" }),
};

function setup() {
  const store = createMemoryCompanyStore(["ws_a:user_ana"]);

  return {
    store,
    tools: crmTools(
      { directory, companies: makeCompanies(store.store), memory, web: null },
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

  test("refuses input that doesn't match the schema", async () => {
    expect((await byName(setup().tools, "get_company").call({ id: 4 })).isError).toBe(true);
  });

  test("memory tools act in the caller's workspace and pass failures on", async () => {
    const { tools } = setup();

    await byName(tools, "search_memory").call({ query: "renewal" });

    expect(memoryCalls).toContain("search ws_a renewal");
    expect(text(await byName(tools, "forget").call({ factId: "f1" }))).toBe("No such fact");
  });

  test("context.dev tools appear only with a key, and read what the agent asks", async () => {
    expect(setup().tools.some((entry) => entry.tool.name === "crm__lookup_company")).toBe(false);

    const tools = crmTools(
      {
        directory,
        companies: makeCompanies(createMemoryCompanyStore([]).store),
        memory,
        web: {
          lookup: async (query) =>
            "domain" in query ? { ...EMPTY_PROFILE, domain: query.domain, name: "Acme" } : null,
          readPage: async (url) => `# Page at ${url}`,
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
