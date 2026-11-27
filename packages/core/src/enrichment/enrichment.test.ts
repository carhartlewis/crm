import { describe, expect, test } from "bun:test";
import {
  cleanUrl,
  companyProfile,
  createTreg,
  emailVerdict,
  linkedinProfileUrl,
  metaHeader,
  peopleRows,
  personProfile,
  phoneVerdict,
  photoFromBody,
  readTregAnswer,
  TregError,
} from "./index.ts";

/** A fetch that answers one fixed JSON body and records the request. */
function fakeFetch(status: number, body: string, headers: Readonly<Record<string, string>> = {}) {
  const requests: { url: string; init: RequestInit }[] = [];

  const impl = async (url: string, init: RequestInit) => {
    requests.push({ url, init });

    return new Response(body, {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };

  return { impl, requests };
}

// Shapes as treg answers them (2026-11-27), with made-up people.
const EMAIL_HIT = JSON.stringify({
  output: { email: "ada@example-ventures.com", verified: true },
  raw: { data: { email: { value: "ada@example-ventures.com", status: "valid" } } },
  _treg: {
    served_by: "crawl4ai.people.email.find",
    outcome: "hit",
    charged_micro: 4950,
    domain_match: true,
    verification: { verdict: "valid", checked: true, cost_micro: 4000 },
  },
});

describe("treg client", () => {
  test("tags the call, asks for a check and reads cost, provider and verdict", async () => {
    const { impl, requests } = fakeFetch(200, EMAIL_HIT, {
      "x-treg-cost-micro": "4950",
      "x-treg-call-id": "call_1",
      "x-treg-served-by": "crawl4ai.people.email.find",
      "x-treg-route-outcome": "hit",
    });

    const treg = createTreg({ token: "t", url: "https://treg.example/", fetch: impl });

    const answer = await treg.call({
      contract: "people.email.find",
      body: { full_name: "Ada Park", domain: "example-ventures.com" },
      meta: { workspace: "wsp,1", user: "u 1", record: undefined },
      verify: true,
      idempotencyKey: "key-1",
    });

    expect(requests[0]?.url).toBe("https://treg.example/call/treg.people.email.find");

    const headers = new Headers(requests[0]?.init.headers);

    expect(headers.get("x-treg-token")).toBe("t");
    expect(headers.get("x-treg-meta")).toBe("workspace=wsp1,user=u1");
    expect(headers.get("x-treg-route-verify")).toBe("true");
    expect(headers.get("idempotency-key")).toBe("key-1");
    expect(answer).toMatchObject({
      outcome: "hit",
      output: { email: "ada@example-ventures.com" },
      costMicro: 4950,
      callId: "call_1",
      servedBy: "crawl4ai.people.email.find",
      check: { verdict: "valid", checked: true },
      domainMatch: true,
    });
  });

  test("a miss is an answer with no output", async () => {
    const { impl } = fakeFetch(
      200,
      JSON.stringify({ output: { email: null }, _treg: { outcome: "miss" } }),
      { "x-treg-route-outcome": "miss" },
    );

    const answer = await createTreg({ token: "t", fetch: impl }).call({
      contract: "people.email.find",
      body: { linkedin_url: "https://www.linkedin.com/in/nobody" },
      meta: {},
    });

    expect(answer.outcome).toBe("miss");
    expect(answer.output).toBeNull();
    expect(answer.costMicro).toBe(0);
  });

  test("an empty balance and a refused identity are typed failures", async () => {
    const empty = createTreg({ token: "t", fetch: fakeFetch(402, '{"detail":"top up"}').impl });

    await expect(
      empty.call({ contract: "people.enrich", body: { email: "a@b.co" }, meta: {} }),
    ).rejects.toBeInstanceOf(TregError);
    await expect(
      empty.call({ contract: "people.enrich", body: { email: "a@b.co" }, meta: {} }),
    ).rejects.toMatchObject({ reason: "balance" });

    const invalid = createTreg({ token: "t", fetch: fakeFetch(422, "{}").impl });

    await expect(
      invalid.call({ contract: "people.enrich", body: {}, meta: {} }),
    ).rejects.toMatchObject({ reason: "invalid" });
  });

  test("sends only the attribution pairs that are set", () => {
    expect(metaHeader({ workspace: "ws_1", user: undefined, origin: "chat" })).toBe(
      "workspace=ws_1,origin=chat",
    );
  });
});

describe("normalised results", () => {
  test("people rows drop placeholders and keep LinkedIn URLs in one form", () => {
    const rows = peopleRows({
      people: [
        {
          name: "Ada Park",
          title: "Founder & Managing Partner",
          company: "Example Ventures",
          company_domain: "Example-Ventures.com",
          location: "Miami, FL, US",
          profile_url: "https://uk.linkedin.com/in/ada-park/",
        },
        { name: "Sam Lee", title: "President", profile_url: "N/A", email: "not an email" },
        { title: "No name" },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Ada Park",
      companyDomain: "example-ventures.com",
      linkedinUrl: "https://www.linkedin.com/in/ada-park",
    });
    expect(rows[1]).toMatchObject({ linkedinUrl: null, email: null });
  });

  test("a company profile takes headcount as a number or a range", () => {
    expect(
      companyProfile({
        name: "Example Ventures",
        domain: "https://www.example-ventures.com/",
        employees: 15,
        industry: "Venture Capital",
        linkedin_url: "https://www.linkedin.com/company/example-ventures",
      }),
    ).toMatchObject({
      name: "Example Ventures",
      domain: "example-ventures.com",
      website: "https://example-ventures.com/",
      employees: "15",
    });
    expect(companyProfile({ domain: "x.com" })).toBeNull();
  });

  test("a person's photo comes only from a photo host, never LinkedIn's default avatar", () => {
    expect(
      photoFromBody(JSON.stringify({ raw: { avatar: "https://static.licdn.com/aero-v1/sc/h/x" } })),
    ).toBeNull();
    expect(
      photoFromBody(
        JSON.stringify({ raw: [{ profile_pic: "https://img.imagecdn.dev/profile/abc.jpeg" }] }),
      ),
    ).toBe("https://img.imagecdn.dev/profile/abc.jpeg");

    const answer = readTregAnswer(
      "linkedin.user.profile",
      JSON.stringify({
        output: {
          full_name: "Ada Park",
          headline: "Investor",
          linkedin_url: "linkedin.com/in/ada",
        },
        raw: { avatar: "https://media.licdn.com/dms/image/v2/abc/photo?e=1" },
      }),
      null,
    );

    expect(answer ? personProfile(answer) : null).toMatchObject({
      name: "Ada Park",
      linkedinUrl: "https://www.linkedin.com/in/ada",
      photoUrl: "https://media.licdn.com/dms/image/v2/abc/photo?e=1",
    });
    // A cached body costs nothing.
    expect(answer?.costMicro).toBe(0);
  });

  test("verdicts read in the CRM's words", () => {
    expect(emailVerdict("accept_all")).toBe("catch_all");
    expect(emailVerdict("Valid")).toBe("valid");
    expect(emailVerdict("something")).toBe("unknown");
    expect(phoneVerdict({ verdict: "live", checked: true })).toBe("live");
    expect(phoneVerdict(null)).toBe("unchecked");
    expect(cleanUrl("example.com/about")).toBe("https://example.com/about");
    expect(linkedinProfileUrl("https://www.linkedin.com/company/acme")).toBeNull();
  });
});
