import { NoActiveWorkspace, NotFound } from "@crm/core/api";
import { createId, ID_PREFIXES } from "@crm/core/ids";
import type { Kv as KvStore } from "@crm/core/kv";
import { isContactId } from "@crm/core/records";
import { isCompanyId } from "@crm/core/company";
import {
  createTrackingKey,
  type CollectPayload,
  emailDomain,
  identifyEmail,
  type IdentifyPayload,
  visitInput,
  type WebsiteActivity,
  websiteRollup,
} from "@crm/core/tracking";
import { Context, Effect, Layer, Schema } from "effect";
import { authorizeWorkspace } from "./companies-rules.ts";
import { Database } from "./Database.ts";
import { Kv } from "./Kv.ts";
import type { Actor } from "./record-writes.ts";
import { prismaTrackingStore, type TrackingStore, type VisitorMatch } from "./tracking-store.ts";

/** Page views and identify calls allowed per key and IP address each minute. */
export const TRACKING_RATE_LIMIT = 120;
const RATE_WINDOW_SECONDS = 60;

/** The answer to a public snippet call: 204, or why it was refused. */
export type PublicOutcome =
  | { readonly status: 204 }
  | { readonly status: 400 | 404 | 429; readonly message: string };

const accepted: PublicOutcome = { status: 204 };

/** A body that isn't a valid snippet call. */
export const badRequest: PublicOutcome = { status: 400, message: "Invalid request" };

const unknownKey: PublicOutcome = { status: 404, message: "Unknown tracking key" };
const tooMany: PublicOutcome = { status: 429, message: "Too many requests" };

type MemberCall<A> = Effect.Effect<A, NoActiveWorkspace | NotFound>;

export interface TrackingService {
  readonly settings: (actor: Actor) => MemberCall<{ key: string | null }>;
  readonly enable: (actor: Actor) => MemberCall<{ key: string | null }>;
  readonly disable: (actor: Actor) => MemberCall<void>;
  readonly activity: (
    actor: Actor,
    kind: "company" | "contact",
    id: string,
  ) => MemberCall<WebsiteActivity | null>;
  /** A page view from the snippet. */
  readonly collect: (
    payload: CollectPayload,
    ip: string | undefined,
  ) => Effect.Effect<PublicOutcome>;
  /** `window.crm.identify(email)`. */
  readonly identify: (
    payload: IdentifyPayload,
    ip: string | undefined,
  ) => Effect.Effect<PublicOutcome>;
}

class TrackingStoreError extends Schema.TaggedError<TrackingStoreError>()("TrackingStoreError", {
  cause: Schema.Defect(),
}) {}

/** A store call; a failure is logged and becomes a defect (500). */
const run = <A>(label: string, fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new TrackingStoreError({ cause }) }).pipe(
    Effect.tapError((error) => Effect.logError(`tracking: ${label} failed`, error)),
    Effect.orDie,
  );

export function makeTracking(
  store: TrackingStore,
  kv: KvStore,
  now: () => Date = () => new Date(),
): TrackingService {
  const workspaceOf = (actor: Actor) =>
    Effect.gen(function* () {
      const isMember = actor.activeWorkspaceId
        ? yield* run("membership", () =>
            store.isMember(actor.activeWorkspaceId ?? "", actor.userId),
          )
        : false;

      const decision = authorizeWorkspace({ activeWorkspaceId: actor.activeWorkspaceId, isMember });

      if (!decision.ok)
        return yield* Effect.fail(new NoActiveWorkspace({ message: decision.message }));

      return decision.value;
    });

  /** Counts a call against its key and address; `false` once over the limit. */
  const withinLimit = (key: string, ip: string | undefined) =>
    run("rate limit", () =>
      kv.increment(`tracking:rate:${key}:${ip ?? "unknown"}`, RATE_WINDOW_SECONDS),
    ).pipe(Effect.map((count) => count <= TRACKING_RATE_LIMIT));

  return {
    settings: (actor) =>
      Effect.gen(function* () {
        const workspaceId = yield* workspaceOf(actor);

        return { key: yield* run("read key", () => store.trackingKey(workspaceId)) };
      }),

    enable: (actor) =>
      Effect.gen(function* () {
        const workspaceId = yield* workspaceOf(actor);
        const existing = yield* run("read key", () => store.trackingKey(workspaceId));

        if (existing) return { key: existing };

        const key = createTrackingKey();

        yield* run("set key", () => store.setTrackingKey(workspaceId, key));

        return { key };
      }),

    disable: (actor) =>
      Effect.gen(function* () {
        const workspaceId = yield* workspaceOf(actor);

        yield* run("clear key", () => store.setTrackingKey(workspaceId, null));
      }),

    activity: (actor, kind, id) =>
      Effect.gen(function* () {
        const workspaceId = yield* workspaceOf(actor);
        const valid = kind === "company" ? isCompanyId(id) : isContactId(id);
        const label = kind === "company" ? "Company" : "Contact";

        if (!valid || !(yield* run("record", () => store.recordExists(kind, workspaceId, id)))) {
          return yield* Effect.fail(new NotFound({ message: `${label} not found` }));
        }

        const visits = yield* run("visits", () =>
          store.visits(workspaceId, kind === "company" ? { companyId: id } : { contactId: id }),
        );

        return websiteRollup(visits);
      }),

    collect: (payload, ip) =>
      Effect.gen(function* () {
        if (!(yield* withinLimit(payload.key, ip))) return tooMany;

        const workspaceId = yield* run("key", () => store.workspaceForKey(payload.key));

        if (!workspaceId) return unknownKey;

        const input = visitInput(payload);

        // A visitor identified earlier keeps their contact; a domain the site passes names the
        // company when nothing else does.
        const known = yield* run("visitor", () => store.visitorMatch(workspaceId, input.visitorId));

        const domainCompany =
          !known?.companyId && input.companyDomain
            ? yield* run("company", () =>
                store.companyByDomain(workspaceId, input.companyDomain ?? ""),
              )
            : null;

        yield* run("insert visit", () =>
          store.insertVisit({
            id: createId(ID_PREFIXES.website_visit),
            workspaceId,
            visitorId: input.visitorId,
            contactId: known?.contactId ?? null,
            companyId: known?.companyId ?? domainCompany,
            path: input.path,
            referrer: input.referrer,
            utmSource: input.utmSource,
            utmMedium: input.utmMedium,
            utmCampaign: input.utmCampaign,
            occurredAt: now(),
          }),
        );

        return accepted;
      }),

    identify: (payload, ip) =>
      Effect.gen(function* () {
        const email = identifyEmail(payload.email);

        if (!email) return badRequest;

        if (!(yield* withinLimit(payload.key, ip))) return tooMany;

        const workspaceId = yield* run("key", () => store.workspaceForKey(payload.key));

        if (!workspaceId) return unknownKey;

        const contact = yield* run("contact", () => store.contactByEmail(workspaceId, email));

        // Without a contact, the email's domain may still name a company.
        const companyId =
          contact?.companyId ??
          (yield* run("company", () => store.companyByDomain(workspaceId, emailDomain(email))));

        const match: VisitorMatch = { contactId: contact?.id ?? null, companyId };

        if (match.contactId || match.companyId) {
          yield* run("match visitor", () =>
            store.matchVisitor(workspaceId, payload.visitor_id, match),
          );
        }

        // Always 204: the answer never says whether an email belongs to a contact.
        return accepted;
      }),
  };
}

export class Tracking extends Context.Service<Tracking, TrackingService>()(
  "@crm/api/services/Tracking",
) {
  static readonly layer = Layer.effect(
    Tracking,
    Effect.gen(function* () {
      return makeTracking(prismaTrackingStore(yield* Database), yield* Kv);
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer]));
}
