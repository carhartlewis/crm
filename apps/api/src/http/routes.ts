import {
  COMPANIES_SYNC_PATH,
  CONNECTIONS_SYNC_PATH,
  CrmApi,
  CUSTOM_CONNECTORS_SYNC_PATH,
  CurrentSession,
  CurrentUser,
  NoActiveWorkspace,
  SKILLS_SYNC_PATH,
  Unauthorized,
} from "@crm/core/api";
import { createGateway } from "@crm/integrations/gateway";
import { clientMetadata } from "@crm/integrations/oauth";
import { Effect, Layer, Option, Result, Schema } from "effect";
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Auth, type McpPrincipal } from "../services/Auth.ts";
import { Companies } from "../services/Companies.ts";
import { type Actor, Connections } from "../services/Connections.ts";
import { Electric } from "../services/Electric.ts";
import { Skills } from "../services/Skills.ts";
import { AuthenticationLive } from "./Authentication.ts";
import { clientIp, withClientIp } from "./client-ip.ts";
import { callbackFromUrl, startFromUrl } from "./desktop.ts";
import {
  companiesSync,
  connectionsSync,
  customConnectorsSync,
  skillsSync,
  type SyncSpec,
} from "./sync-proxy.ts";

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

/** The acting user and the session's workspace; services verify membership. */
const actor = Effect.gen(function* () {
  const user = yield* CurrentUser;
  const session = yield* CurrentSession;

  return { userId: user.id, activeWorkspaceId: session.activeWorkspaceId } satisfies Actor;
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

const ConnectionsHandlers = HttpApiBuilder.group(CrmApi, "connections", (handlers) =>
  Effect.gen(function* () {
    const connections = yield* Connections;

    return handlers
      .handle("list", () => Effect.flatMap(actor, connections.list))
      .handle("logos", () => Effect.flatMap(actor, connections.logos))
      .handle("catalog", () => Effect.flatMap(actor, connections.catalog))
      .handle("addCustom", ({ payload }) =>
        Effect.flatMap(actor, (who) => connections.addCustom(who, payload)),
      )
      .handle("removeCustom", ({ params }) =>
        Effect.flatMap(actor, (who) => connections.removeCustom(who, params.id)),
      )
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

const SkillsHandlers = HttpApiBuilder.group(CrmApi, "skills", (handlers) =>
  Effect.gen(function* () {
    const skills = yield* Skills;

    return handlers
      .handle("list", () => Effect.flatMap(actor, skills.list))
      .handle("create", ({ payload }) =>
        Effect.flatMap(actor, (who) => skills.create(who, payload)),
      )
      .handle("discover", ({ query }) =>
        Effect.flatMap(actor, (who) => skills.discover(who, query.q)),
      )
      .handle("install", ({ payload }) =>
        Effect.flatMap(actor, (who) => skills.install(who, payload.sourceId)),
      )
      .handle("get", ({ params }) => Effect.flatMap(actor, (who) => skills.get(who, params.id)))
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(actor, (who) => skills.setEnabled(who, params.id, payload.enabled)),
      )
      .handle("remove", ({ params }) =>
        Effect.flatMap(actor, (who) => skills.remove(who, params.id)),
      );
  }),
);

const ApiRoutes = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide([
    SystemHandlers,
    AccountHandlers,
    CompaniesHandlers,
    ConnectionsHandlers,
    SkillsHandlers,
  ]),
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
 * Synced tables: each proxy path and the shape it serves for a verified workspace and user.
 * A table needs a migration-free setup only: Electric sets REPLICA IDENTITY FULL itself.
 */
const synced: ReadonlyArray<
  readonly [HttpRouter.PathInput, (workspaceId: string, userId: string) => SyncSpec]
> = [
  [COMPANIES_SYNC_PATH, (workspaceId) => companiesSync(workspaceId)],
  [CONNECTIONS_SYNC_PATH, (workspaceId, userId) => connectionsSync(workspaceId, userId)],
  [CUSTOM_CONNECTORS_SYNC_PATH, (workspaceId) => customConnectorsSync(workspaceId)],
  [SKILLS_SYNC_PATH, (workspaceId) => skillsSync(workspaceId)],
];

/**
 * Electric shape proxy (raw routes: they stream Electric's body through). The session must be
 * signed in and `?workspace=` must be its active workspace with a membership; the table, row
 * filter, columns and secret are fixed here, and only Electric protocol params pass through.
 */
const SyncRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const auth = yield* Auth;
    const companies = yield* Companies;
    const electric = yield* Electric;

    for (const [path, specFor] of synced) {
      yield* router.add("GET", path, (request) =>
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

          const spec = specFor(workspace.success, session.value.user.id);

          return yield* electric.sync(spec, query, headers).pipe(
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
    }
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
    const skills = yield* Skills;

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

    // The workspace's enabled skills, for the agent. Same better-auth MCP token as the gateway.
    const agentSkills = auth.protectMcp(async (_request, principal) =>
      Response.json(await skills.forAgent(principal), { headers: { "cache-control": "no-store" } }),
    );

    yield* router.add("GET", "/api/agent/skills", () => HttpEffect.fromWebHandler(agentSkills));
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
 * Every HTTP route, still requiring `Auth`, `Companies`, `Electric` and `Connections`. `main.ts`
 * provides the real services; tests provide fakes.
 */
export const Routes = Layer.mergeAll(ApiRoutes, AuthRoutes, SyncRoutes, ConnectionRoutes);
