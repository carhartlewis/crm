import { describe, expect, test } from "bun:test";
import { rankSearch } from "@crm/ui/lib/search-rank";
import { newCompany } from "./companies.ts";
import { newContact } from "./contacts.ts";
import { companyHit, contactHit, type RecordHit } from "./record-search.ts";

const roo = {
  ...newCompany({
    workspaceId: "ws_a",
    ownerId: null,
    name: "Roo Capital",
    domain: "roocapital.com",
  }),
  industry: "Venture Capital",
  city: "Miami",
};

const nate = {
  ...newContact("ws_a", null, {
    first_name: "Nate",
    last_name: "DaPore",
    email: "nate@roocapital.com",
    title: "Founder & Managing Partner",
    phone: "+1 (843) 607-8601",
    company_id: roo.id,
    linkedin_url: "https://www.linkedin.com/in/natedapore",
  }),
};

const hits: readonly RecordHit[] = [companyHit(roo), contactHit(nate, roo.name)];

const searchable = hits.map((hit) => Object.assign({ section: hit.kind }, hit));

/** What ⌘K would list first for `query`, ranked as the palette ranks it. */
const found = (query: string) =>
  rankSearch(searchable, query).map(({ item }) => `${item.kind}:${item.label}`);

describe("⌘K record search", () => {
  test("finds a record by its name", () => {
    expect(found("nate")[0]).toBe("contact:Nate DaPore");
    expect(found("roo cap")[0]).toBe("company:Roo Capital");
  });

  test("finds contacts by their company, title, email, phone or LinkedIn handle", () => {
    expect(found("roo capital")).toContain("contact:Nate DaPore");
    expect(found("managing partner")).toEqual(["contact:Nate DaPore"]);
    expect(found("nate@roocapital")).toContain("contact:Nate DaPore");
    expect(found("8436078601")).toEqual(["contact:Nate DaPore"]);
    expect(found("natedapore")).toEqual(["contact:Nate DaPore"]);
  });

  test("finds companies by domain, industry or city", () => {
    expect(found("roocapital.com")).toContain("company:Roo Capital");
    expect(found("venture")).toEqual(["company:Roo Capital"]);
    expect(found("miami")).toEqual(["company:Roo Capital"]);
  });
});
