import { describe, expect, test } from "bun:test";
import { createMemoryKv } from "@crm/core/kv";
import { Effect, Exit } from "effect";
import { parseCollect, parseIdentify } from "@crm/core/tracking";
import { badRequest, makeTracking, TRACKING_RATE_LIMIT, type TrackingService } from "./Tracking.ts";
import { createMemoryTrackingStore } from "./tracking-store-memory.ts";

const WS = "ws_a";
const COMPANY = "com_0123456789ABCDEFGHIJKLMN";
const OTHER_COMPANY = "com_ZYXWVUTSRQPONMLKJIHGFEDC";
const CONTACT = "ctc_0123456789ABCDEFGHIJKLMN";
const VISITOR = "visitor-0001";
const member = { userId: "user_1", activeWorkspaceId: WS };

function setup() {
  const memory = createMemoryTrackingStore({
    members: [`${WS}:user_1`],
    contacts: [{ id: CONTACT, workspaceId: WS, email: "ana@northwind.io", companyId: COMPANY }],
    companies: [
      { id: COMPANY, workspaceId: WS, domain: "northwind.io" },
      { id: OTHER_COMPANY, workspaceId: WS, domain: "acme.com" },
    ],
  });

  // The rate limiter's clock, and the visits' (each visit a minute after the last).
  let clock = new Date("2026-08-01T09:00:00Z").getTime();
  let visitAt = clock;

  const tracking = makeTracking(
    memory.store,
    createMemoryKv(() => clock),
    () => {
      visitAt += 60_000;

      return new Date(visitAt);
    },
  );

  return { memory, tracking, advance: (ms: number) => (clock += ms) };
}

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

/** A snippet body as the browser would send it. */
type Body = Readonly<Record<string, string | null>>;

/** Sends a body the way the route does: parsed from its JSON text, or refused as a bad request. */
const send = {
  collect: (tracking: TrackingService, body: Body, ip: string) => {
    const payload = parseCollect(JSON.stringify(body));

    return payload ? tracking.collect(payload, ip) : Effect.succeed(badRequest);
  },
  identify: (tracking: TrackingService, body: Body, ip: string) => {
    const payload = parseIdentify(JSON.stringify(body));

    return payload ? tracking.identify(payload, ip) : Effect.succeed(badRequest);
  },
};

async function enabled() {
  const context = setup();
  const { key } = await run(context.tracking.enable(member));

  if (!key) throw new Error("expected a key");

  return { ...context, key };
}

describe("tracking settings", () => {
  test("enable makes one key and keeps it; disable clears it", async () => {
    const { tracking } = setup();

    expect(await run(tracking.settings(member))).toEqual({ key: null });

    const first = await run(tracking.enable(member));

    expect(first.key).toMatch(/^trk_/);
    expect(await run(tracking.enable(member))).toEqual(first);

    await run(tracking.disable(member));

    expect(await run(tracking.settings(member))).toEqual({ key: null });
  });

  test("a non-member can't read or change the settings", async () => {
    const { tracking } = setup();

    const exit = await Effect.runPromiseExit(
      tracking.enable({ userId: "stranger", activeWorkspaceId: WS }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("collect", () => {
  test("refuses a bad body and an unknown key", async () => {
    const { tracking } = await enabled();

    expect(await run(send.collect(tracking, { nope: "yes" }, "1.1.1.1"))).toMatchObject({
      status: 400,
    });
    expect(
      await run(
        send.collect(
          tracking,
          { key: "trk_ZZZZZZZZZZZZZZZZZZZZZZZZ", visitor_id: VISITOR, path: "/" },
          "1.1.1.1",
        ),
      ),
    ).toMatchObject({ status: 404 });
  });

  test("stores a page view, unmatched until identified", async () => {
    const { tracking, memory, key } = await enabled();

    expect(
      await run(
        send.collect(tracking, { key, visitor_id: VISITOR, path: "/pricing?x=1" }, "1.1.1.1"),
      ),
    ).toEqual({ status: 204 });

    expect(memory.visits()).toHaveLength(1);
    expect(memory.visits()[0]).toMatchObject({
      workspaceId: WS,
      visitorId: VISITOR,
      path: "/pricing",
      contactId: null,
      companyId: null,
    });
  });

  test("a company domain from the site matches the company", async () => {
    const { tracking, memory, key } = await enabled();

    await run(
      send.collect(
        tracking,
        { key, visitor_id: VISITOR, path: "/", company_domain: "www.acme.com" },
        "1.1.1.1",
      ),
    );

    expect(memory.visits()[0]?.companyId).toBe(OTHER_COMPANY);
  });

  test("stops counting past the per-minute limit for a key and address", async () => {
    const { tracking, key, advance } = await enabled();
    const body = { key, visitor_id: VISITOR, path: "/" };

    for (let index = 0; index < TRACKING_RATE_LIMIT; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the limit counts calls in order.
      await run(send.collect(tracking, body, "2.2.2.2"));
    }

    expect(await run(send.collect(tracking, body, "2.2.2.2"))).toMatchObject({ status: 429 });
    // Another address has its own budget.
    expect(await run(send.collect(tracking, body, "3.3.3.3"))).toEqual({ status: 204 });

    advance(120_000);

    expect(await run(send.collect(tracking, body, "2.2.2.2"))).toEqual({ status: 204 });
  });
});

describe("identify", () => {
  test("links earlier and later visits to the contact and their company", async () => {
    const { tracking, memory, key } = await enabled();

    await run(send.collect(tracking, { key, visitor_id: VISITOR, path: "/" }, "1.1.1.1"));
    expect(
      await run(
        send.identify(
          tracking,
          { key, visitor_id: VISITOR, email: " Ana@Northwind.io " },
          "1.1.1.1",
        ),
      ),
    ).toEqual({ status: 204 });
    await run(send.collect(tracking, { key, visitor_id: VISITOR, path: "/docs" }, "1.1.1.1"));

    expect(memory.visits().map((visit) => [visit.contactId, visit.companyId])).toEqual([
      [CONTACT, COMPANY],
      [CONTACT, COMPANY],
    ]);
  });

  test("an unknown email still matches the company of its domain", async () => {
    const { tracking, memory, key } = await enabled();

    await run(send.collect(tracking, { key, visitor_id: VISITOR, path: "/" }, "1.1.1.1"));
    await run(
      send.identify(tracking, { key, visitor_id: VISITOR, email: "bo@acme.com" }, "1.1.1.1"),
    );

    expect(memory.visits()[0]).toMatchObject({ contactId: null, companyId: OTHER_COMPANY });
  });

  test("answers 204 whether or not the email is known, and leaves strangers alone", async () => {
    const { tracking, memory, key } = await enabled();

    await run(send.collect(tracking, { key, visitor_id: VISITOR, path: "/" }, "1.1.1.1"));

    expect(
      await run(
        send.identify(tracking, { key, visitor_id: VISITOR, email: "x@gmail.com" }, "1.1.1.1"),
      ),
    ).toEqual({ status: 204 });
    expect(memory.visits()[0]).toMatchObject({ contactId: null, companyId: null });
    expect(
      await run(send.identify(tracking, { key, visitor_id: VISITOR, email: "nope" }, "1.1.1.1")),
    ).toMatchObject({ status: 400 });
  });
});

describe("activity", () => {
  test("rolls up a contact's and a company's visits; null without visits", async () => {
    const { tracking, key } = await enabled();

    expect(await run(tracking.activity(member, "company", COMPANY))).toBeNull();

    await run(
      send.collect(
        tracking,
        { key, visitor_id: VISITOR, path: "/", referrer: "https://www.google.com/" },
        "1.1.1.1",
      ),
    );
    await run(
      send.identify(tracking, { key, visitor_id: VISITOR, email: "ana@northwind.io" }, "1.1.1.1"),
    );
    await run(send.collect(tracking, { key, visitor_id: VISITOR, path: "/pricing" }, "1.1.1.1"));
    await run(send.collect(tracking, { key, visitor_id: VISITOR, path: "/pricing" }, "1.1.1.1"));

    const company = await run(tracking.activity(member, "company", COMPANY));

    expect(company).toMatchObject({
      views: 3,
      top_page: { path: "/pricing", views: 2 },
      original_source: "Google · organic",
      latest_source: "Direct",
    });
    expect(await run(tracking.activity(member, "contact", CONTACT))).toEqual(company);
  });

  test("an id outside the workspace is not found", async () => {
    const { tracking } = setup();

    const exit = await Effect.runPromiseExit(
      tracking.activity(member, "company", "com_AAAAAAAAAAAAAAAAAAAAAAAA"),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
