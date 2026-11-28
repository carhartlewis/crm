import { describe, expect, test } from "bun:test";
import {
  duplicateReason,
  findDuplicate,
  linkedinHandle,
  nameKey,
  type PersonIdentity,
  sameFirstName,
} from "@crm/core/records";

const ben: PersonIdentity = {
  firstName: "Ben",
  lastName: "Tossell",
  email: null,
  linkedinUrl: null,
  companyId: "com_bites",
};

describe("duplicate people", () => {
  test("LinkedIn handles compare across hosts, case, encoding and tracking", () => {
    expect(linkedinHandle("https://uk.linkedin.com/in/Ben-Tossell-70453537/?trk=x")).toBe(
      "ben-tossell-70453537",
    );
    expect(linkedinHandle("linkedin.com/in/jos%C3%A9-p")).toBe("josé-p");
    expect(linkedinHandle("https://www.linkedin.com/company/sentry")).toBeNull();
  });

  test("names compare without accents, case or punctuation; first names allow short forms", () => {
    expect(nameKey("  José  O'Neil ")).toBe("jose oneil");
    expect(sameFirstName("Ben", "Benjamin")).toBe(true);
    expect(sameFirstName("Bob", "Robert")).toBe(true);
    expect(sameFirstName("Chris", "Christopher")).toBe(true);
    expect(sameFirstName("Al", "Alan")).toBe(false);
    expect(sameFirstName("Adam", "Ben")).toBe(false);
  });

  test("a name matches only at the same company, with a last name", () => {
    expect(duplicateReason(ben, { ...ben, firstName: "Benjamin", email: "b@x.io" })).toBe("name");
    expect(duplicateReason(ben, { ...ben, companyId: "com_other" })).toBeNull();
    expect(duplicateReason(ben, { ...ben, companyId: null })).toBeNull();
    expect(duplicateReason({ ...ben, lastName: null }, { ...ben, lastName: null })).toBeNull();
    expect(duplicateReason(ben, { ...ben, firstName: "Adam" })).toBeNull();
  });

  test("LinkedIn and email match anywhere; two different profiles are two people", () => {
    const here = { ...ben, linkedinUrl: "https://www.linkedin.com/in/ben-tossell-70453537" };

    expect(
      duplicateReason(here, {
        ...ben,
        firstName: "B.",
        companyId: null,
        linkedinUrl: "http://linkedin.com/in/BEN-TOSSELL-70453537/",
      }),
    ).toBe("linkedin");
    expect(
      duplicateReason(
        { ...ben, email: "Ben@BensBites.com" },
        {
          ...ben,
          companyId: null,
          email: "ben@bensbites.com",
        },
      ),
    ).toBe("email");
    expect(
      duplicateReason(here, { ...ben, linkedinUrl: "https://www.linkedin.com/in/ben-tossell-2" }),
    ).toBeNull();
  });

  test("the strongest reason wins, and a live contact over an archived one", () => {
    const rows = [
      { id: "a", ...ben, archived: false },
      { id: "b", ...ben, email: "ben@bensbites.com", archived: true },
      { id: "c", ...ben, email: "ben@bensbites.com", archived: false },
    ];

    expect(findDuplicate({ ...ben, email: "ben@bensbites.com" }, rows, (row) => row)).toMatchObject(
      { contact: { id: "c" }, reason: "email" },
    );
    expect(findDuplicate({ ...ben, lastName: "Hill" }, rows, (row) => row)).toBeNull();
  });
});
