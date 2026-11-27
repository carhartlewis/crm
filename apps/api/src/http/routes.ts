import { CrmApi, CurrentSession, CurrentUser } from "@crm/core/api";
import { createGateway } from "@crm/integrations/gateway";
import { clientMetadata } from "@crm/integrations/oauth";
import { Effect, Layer, Option } from "effect";
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Auth, type McpPrincipal } from "../services/Auth.ts";
import { type Actor, Connections } from "../services/Connections.ts";
import { AuthenticationLive } from "./Authentication.ts";
import { clientIp, withClientIp } from "./client-ip.ts";
import { callbackFromUrl, startFromUrl } from "./desktop.ts";

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

const actor = Effect.gen(function* () {
  const user = yield* CurrentUser;
  const session = yield* CurrentSession;

  return { userId: user.id, activeWorkspaceId: session.activeWorkspaceId } satisfies Actor;
});

const ConnectionsHandlers = HttpApiBuilder.group(CrmApi, "connections", (handlers) =>
  Effect.gen(function* () {
    const connections = yield* Connections;

    return handlers
      .handle("list", () => Effect.flatMap(actor, connections.list))
      .handle("authorize", ({ params, payload }) =>
        Effect.flatMap(actor, (who) =>
          connections.authorize(who, params.integration, payload.access),
        ),
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(actor, (who) => connections.update(who, params.integration, payload.access)),
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(actor, (who) => connections.remove(who, params.integration)),
      );
  }),
);

const ApiRoutes = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide([SystemHandlers, AccountHandlers, ConnectionsHandlers]),
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

/** Shown in a signed-out browser after a sign-in started in the desktop app. */
function finishedPage(target: URL) {
  const connected = target.searchParams.get("connected");

  const message = connected
    ? "The app is connected. You can close this tab and go back to the CRM."
    : "The app could not be connected. Go back to the CRM and try again.";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CRM</title></head><body style="font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0"><p>${message}</p></body></html>`;
}

/**
 * Connections outside the JSON API: the OAuth redirect from each app, this app's Client ID
 * Metadata Document, and the MCP gateway the agent calls (better-auth MCP tokens only). The
 * gateway's RFC 9728 and RFC 8414 discovery documents are better-auth's, at the origin root.
 */
const ConnectionRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const auth = yield* Auth;
    const connections = yield* Connections;

    const gateway = createGateway<McpPrincipal>({
      connections: connections.gatewayConnections,
      fetch: connections.oauth.fetch,
      onError: (error, integration) => {
        Effect.runFork(Effect.logWarning(`gateway: ${integration} failed`, error));
      },
    });

    yield* Effect.addFinalizer(() => Effect.promise(() => gateway.close()));

    const toAuth = (request: HttpServerRequest.HttpServerRequest) =>
      HttpEffect.fromWebHandler((web) => auth.handler(withClientIp(web, ipOf(request))));

    yield* router.add("GET", "/.well-known/oauth-protected-resource/*", toAuth);
    yield* router.add("GET", "/.well-known/oauth-authorization-server/*", toAuth);

    const mcp = auth.protectMcp((request, principal) => gateway.fetch(request, principal));

    yield* router.add("POST", "/api/mcp", () => HttpEffect.fromWebHandler(mcp));
    // Stateless gateway: no SSE stream to resume and no session to end.
    yield* router.add("GET", "/api/mcp", () =>
      Effect.succeed(HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })),
    );
    yield* router.add("DELETE", "/api/mcp", () =>
      Effect.succeed(HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })),
    );

    yield* router.add("GET", "/api/connections/client-metadata.json", () =>
      Effect.succeed(HttpServerResponse.jsonUnsafe(clientMetadata(connections.oauth))),
    );

    yield* router.add("GET", "/api/connections/callback", (request) =>
      Effect.gen(function* () {
        const url = new URL(request.url, "http://api");

        const session = yield* auth.session(new Headers(request.headers)).pipe(
          Effect.map(Option.getOrNull),
          Effect.orElseSucceed(() => null),
        );

        const target = yield* connections.callback(session?.user.id ?? null, {
          state: url.searchParams.get("state"),
          code: url.searchParams.get("code"),
          iss: url.searchParams.get("iss"),
          error: url.searchParams.get("error"),
        });

        // The system browser (desktop) isn't signed in to the web app; tell the user to go back.
        if (!session) return HttpServerResponse.html(finishedPage(target));

        return HttpServerResponse.redirect(target.href, { status: 302 });
      }),
    );
  }),
);

/**
 * Every HTTP route, still requiring `Auth` and `Connections`. `main.ts` provides the real
 * services; tests provide fakes.
 */
export const Routes = Layer.mergeAll(ApiRoutes, AuthRoutes, ConnectionRoutes);
