import { CrmApi, CurrentSession, CurrentUser } from "@crm/core/api";
import {
  MAX_TRACKING_BODY,
  parseCollect,
  parseIdentify,
  TRACKING_COLLECT_PATH,
  TRACKING_IDENTIFY_PATH,
  TRACKING_SCRIPT_PATH,
} from "@crm/core/tracking";
import { Effect, Layer, Option } from "effect";
import { HttpEffect, HttpRouter, type HttpServerRequest } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import type { Actor } from "../services/record-writes.ts";
import { badRequest, type PublicOutcome, Tracking } from "../services/Tracking.ts";
import { clientIp } from "./client-ip.ts";
import { TRACKING_SCRIPT } from "./tracking-script.ts";

const actor = Effect.gen(function* () {
  const user = yield* CurrentUser;
  const session = yield* CurrentSession;

  return { userId: user.id, activeWorkspaceId: session.activeWorkspaceId } satisfies Actor;
});

/** Members' tracking endpoints (`TrackingApi`): settings and per-record website activity. */
export const TrackingHandlers = HttpApiBuilder.group(CrmApi, "tracking", (handlers) =>
  Effect.gen(function* () {
    const tracking = yield* Tracking;

    return handlers
      .handle("settings", () => Effect.flatMap(actor, tracking.settings))
      .handle("enable", () => Effect.flatMap(actor, tracking.enable))
      .handle("disable", () => Effect.flatMap(actor, tracking.disable))
      .handle("company", ({ params }) =>
        Effect.flatMap(actor, (who) => tracking.activity(who, "company", params.id)),
      )
      .handle("contact", ({ params }) =>
        Effect.flatMap(actor, (who) => tracking.activity(who, "contact", params.id)),
      );
  }),
);

/** Any website may load the script and send to these endpoints; none of them reads a cookie. */
const OPEN_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const ipOf = (request: HttpServerRequest.HttpServerRequest) =>
  clientIp(
    Option.getOrUndefined(request.remoteAddress),
    request.headers["x-forwarded-for"] ?? null,
  );

/** The body a snippet call sent (JSON as text/plain, to stay CORS-simple); "" when too long. */
async function readText(web: Request) {
  if (Number(web.headers.get("content-length") ?? "0") > MAX_TRACKING_BODY) return "";

  return await web.text().catch(() => "");
}

const respond = (outcome: PublicOutcome) =>
  outcome.status === 204
    ? new Response(null, { status: 204, headers: OPEN_CORS })
    : Response.json({ message: outcome.message }, { status: outcome.status, headers: OPEN_CORS });

/**
 * The website snippet's public routes (no session): the script, page views and identify. Rate
 * limited per tracking key and client address in the Tracking service.
 */
export const TrackingRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const tracking = yield* Tracking;

    yield* router.add("GET", TRACKING_SCRIPT_PATH, () =>
      HttpEffect.fromWebHandler(
        async () =>
          new Response(TRACKING_SCRIPT, {
            headers: {
              ...OPEN_CORS,
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": "public, max-age=3600",
            },
          }),
      ),
    );

    const routes = [
      [
        TRACKING_COLLECT_PATH,
        (text: string, ip: string | undefined) => {
          const payload = parseCollect(text);

          return payload ? tracking.collect(payload, ip) : Effect.succeed(badRequest);
        },
      ],
      [
        TRACKING_IDENTIFY_PATH,
        (text: string, ip: string | undefined) => {
          const payload = parseIdentify(text);

          return payload ? tracking.identify(payload, ip) : Effect.succeed(badRequest);
        },
      ],
    ] as const;

    for (const [path, call] of routes) {
      yield* router.add("OPTIONS", path, () =>
        HttpEffect.fromWebHandler(
          async () => new Response(null, { status: 204, headers: OPEN_CORS }),
        ),
      );

      yield* router.add("POST", path, (request) =>
        HttpEffect.fromWebHandler(async (web) =>
          respond(await Effect.runPromise(call(await readText(web), ipOf(request)))),
        ),
      );
    }
  }),
);
