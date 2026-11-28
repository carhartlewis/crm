import { describe, expect, test } from "bun:test";
import { newCompany } from "./companies.ts";
import { newContact } from "./contacts.ts";
import { contactFor } from "./people.ts";
import type { PersonResultRow } from "./tool-results.ts";

const bites = newCompany({
  workspaceId: "ws",
  ownerId: null,
  name: "Ben's Bites",
  domain: "bensbites.com",
});

const row = (input: Partial<PersonResultRow>): PersonResultRow => ({
  name: "Ben Tossell",
  title: "Founder",
  company: "Ben's Bites",
  companyDomain: "bensbites.com",
  location: null,
  linkedinUrl: null,
  email: null,
  emailStatus: null,
  contactId: null,
  ...input,
});

describe("people already in the CRM", () => {
  test("a contact research hasn't filled yet still matches by name at the company", () => {
    const ben = newContact("ws", null, {
      first_name: "Ben",
      last_name: "Tossell",
      email: null,
      title: null,
      phone: null,
      company_id: bites.id,
    });

    expect(contactFor(row({}), [ben], [bites])?.id).toBe(ben.id);
    expect(contactFor(row({ name: "Adam Tossell" }), [ben], [bites])).toBeNull();
    // A different LinkedIn profile is someone else with the same name.
    expect(
      contactFor(
        row({ linkedinUrl: "https://www.linkedin.com/in/ben-2" }),
        [{ ...ben, linkedin_url: "https://www.linkedin.com/in/ben-1" }],
        [bites],
      ),
    ).toBeNull();
  });
});
