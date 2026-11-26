import {
  COMPANIES_SYNC_PATH,
  CrmApi,
  CurrentSession,
  CurrentUser,
  NoActiveWorkspace,
  Unauthorized,
} from "@crm/core/api";
import { Effect, Layer, Option, Result, Schema } from "effect";
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Auth } from "../services/Auth.ts";
import { Companies } from "../services/Companies.ts";
import { Electric } from "../services/Electric.ts";
import { AuthenticationLive } from "./Authentication.ts";
import { clientIp, withClientIp } from "./client-ip.ts";
import { callbackFromUrl, startFromUrl } from "./desktop.ts";
import { companiesSync } from "./sync-proxy.ts";

const SystemHandlers = HttpApiBuilder.group(CrmApi, "system", (handlers) =>
  handlers.handle("health", () => Effect.void),
);

const AccountHandlers = HttpApiBuilder.group(CrmApi, "account", (handlers) =>
  handlers.handle("me", () =>
    Effect.gen(function* () {
      return yield* CurrentUser;
    }),
  ),
);

/** The acting user and the session's workspace; `Companies` verifies membership. */
const actor = Effect.gen(function* () {
  const user = yield* CurrentUser;
  const session = yield* CurrentSession;

  return { userId: user.id, activeWorkspaceId: session.activeWorkspaceId };
});

const CompaniesHandlers = HttpApiBuilder.group(
  CrmApi,
  "companies",
  Effect.fn(function* (handlers) {
    const companies = yield* Companies;

    return handlers
      .handle("create", ({ payload }) =>
        Effect.flatMap(actor, (who) => companies.create(who, payload)),
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(actor, (who) => companies.update(who, params.id, payload)),
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(actor, (who) => companies.remove(who, params.id)),
      );
  }),
);

const ApiRoutes = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide([SystemHandlers, AccountHandlers, CompaniesHandlers]),
  Layer.provide(AuthenticationLive),
);

/** Client IP for better-auth and the desktop start limiter (see client-ip.ts). */
const ipOf = (request: HttpServerRequest.HttpServerRequest) =>
  clientIp(
    Option.getOrUndefined(request.remoteAddress),
    request.headers["x-forwarded-for"] ?? null,
  );

const badRequest = HttpServerResponse.text("Invalid desktop sign-in request", { status: 400 });

/**
 * better-auth owns `/api/auth/*` (sign-in, sign-out, session, OAuth callbacks). The two
 * `/api/desktop/*` routes run Google sign-in in the system browser for the Electron app.
 */
const AuthRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const auth = yield* Auth;

    yield* router.add("*", "/api/auth/*", (request) =>
      HttpEffect.fromWebHandler((web) => auth.handler(withClientIp(web, ipOf(request)))),
    );

    yield* router.add("GET", "/api/desktop/google", (request) =>
      Option.match(startFromUrl(new URL(request.url, "http://api")), {
        onNone: () => Effect.succeed(badRequest),
        onSome: (start) =>
          auth.desktopStart(start, ipOf(request)).pipe(Effect.map(HttpServerResponse.fromWeb)),
      }),
    );

    yield* router.add("GET", "/api/desktop/callback", (request) =>
      Option.match(callbackFromUrl(new URL(request.url, "http://api")), {
        onNone: () => Effect.succeed(badRequest),
        onSome: ({ callback, oauthError }) =>
          auth
            .desktopFinish(new Headers(request.headers), callback, oauthError)
            .pipe(Effect.map(HttpServerResponse.fromWeb)),
      }),
    );
  }),
);

const noStore = { "cache-control": "no-store", vary: "Cookie" };

const encodeError = Schema.encodeSync(Schema.Union([Unauthorized, NoActiveWorkspace]));

/** The same error bodies the HttpApi endpoints send, never cached. */
const syncError = (error: Unauthorized | NoActiveWorkspace) =>
  HttpServerResponse.jsonUnsafe(encodeError(error), {
    status: error instanceof Unauthorized ? 401 : 403,
    headers: noStore,
  });

/**
 * Electric shape proxy (raw route: it streams Electric's body through). The session must be
 * signed in and `?workspace=` must be its active workspace with a membership; the table, row
 * filter and secret are fixed here, and only Electric protocol params pass through.
 */
const SyncRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const auth = yield* Auth;
    const companies = yield* Companies;
    const electric = yield* Electric;

    yield* router.add("GET", COMPANIES_SYNC_PATH, (request) =>
      Effect.gen(function* () {
        const headers = new Headers(request.headers);

        const session = yield* auth.session(headers).pipe(
          Effect.tapError((error) => Effect.logError("session lookup failed", error)),
          Effect.option,
          Effect.map(Option.flatten),
        );

        if (Option.isNone(session))
          return syncError(new Unauthorized({ message: "Not signed in" }));

        const query = new URL(request.url, "http://api").searchParams;

        const workspace = yield* companies
          .workspaceFor(
            { userId: session.value.user.id, activeWorkspaceId: session.value.activeWorkspaceId },
            query.get("workspace"),
          )
          .pipe(Effect.result);

        if (Result.isFailure(workspace)) {
          return syncError(workspace.failure);
        }

        return yield* electric.sync(companiesSync(workspace.success), query, headers).pipe(
          Effect.map(HttpServerResponse.fromWeb),
          Effect.catchTag("ElectricError", (error) =>
            Effect.logError("electric unreachable", error).pipe(
              Effect.as(
                HttpServerResponse.text("Sync service unavailable", {
                  status: 502,
                  headers: noStore,
                }),
              ),
            ),
          ),
        );
      }).pipe(Effect.interruptible),
    );
  }),
);

/**
 * Every HTTP route, still requiring `Auth`, `Companies` and `Electric`. `main.ts` provides the
 * real services; tests provide fakes.
 */
export const Routes = Layer.mergeAll(ApiRoutes, AuthRoutes, SyncRoutes);
