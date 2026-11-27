import { SessionUser } from "@crm/core/api";
import { createAuth } from "@crm/core/auth";
import { registerAgentClient, WORKSPACE_CLAIM } from "@crm/core/auth/mcp";
import { requireMcpAuth } from "@better-auth/mcp";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../config.ts";
import type { DesktopCallback, DesktopStart } from "../http/desktop.ts";
import { makeDesktopHandoff } from "./desktop-handoff.ts";
import { Images } from "./Images.ts";
import { Kv } from "./Kv.ts";
import { Postgres } from "./Postgres.ts";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  cause: Schema.Defect(),
}) {}

/** The signed-in user and the workspace the session acts in (not yet checked for membership). */
export interface SessionInfo {
  readonly user: SessionUser;
  readonly activeWorkspaceId: string | null;
}

/** The caller of the MCP gateway, from a verified access token. */
export interface McpPrincipal {
  readonly userId: string;
  readonly workspaceId: string;
}

export interface AuthService {
  /** better-auth's Web handler for `/api/auth/*` and its `/.well-known/*` discovery documents. */
  readonly handler: (request: Request) => Promise<Response>;
  /** Resolves the session from request headers (cookie). `None` when signed out. */
  readonly session: (headers: Headers) => Effect.Effect<Option.Option<SessionInfo>, AuthError>;
  /**
   * Guards the MCP gateway: verifies the bearer token (signature, issuer, audience, expiry) and
   * calls `handler` with its user and workspace. Without a valid token it answers 401 with the
   * RFC 9728 challenge that starts the agent's sign-in.
   */
  readonly protectMcp: (
    handler: (request: Request, principal: McpPrincipal) => Promise<Response>,
  ) => (request: Request) => Promise<Response>;
  /** Desktop sign-in, step 1: record the attempt and send the browser to Google. */
  readonly desktopStart: (
    request: DesktopStart,
    clientIp: string | undefined,
  ) => Effect.Effect<Response, AuthError>;
  /** Desktop sign-in, step 2: verify the attempt and hand a single-use code to the app's loopback. */
  readonly desktopFinish: (
    headers: Headers,
    callback: DesktopCallback,
    oauthError: string | null,
  ) => Effect.Effect<Response, AuthError>;
}

const decodeUser = Schema.decodeUnknownEffect(SessionUser);

const decodeActiveWorkspace = Schema.decodeUnknownEffect(
  Schema.Struct({ activeOrganizationId: Schema.optional(Schema.NullOr(Schema.String)) }),
);

const decodeMcpClaims = Schema.decodeUnknownOption(
  Schema.Struct({ sub: Schema.NonEmptyString, [WORKSPACE_CLAIM]: Schema.NonEmptyString }),
);

const decodeRedirect = Schema.decodeUnknownPromise(Schema.Struct({ url: Schema.String }));

/** better-auth as an Effect service. Tests provide `Auth.of(...)` with a fake instead of this layer. */
export class Auth extends Context.Service<Auth, AuthService>()("@crm/api/services/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const pool = yield* Postgres;
      const kv = yield* Kv;
      const images = yield* Images;

      const gateway = new URL("/api/mcp", config.authUrl).href;

      const agentCallbackPrefix = new URL(
        "/eve/v1/connections/connections/callback/",
        config.agentUrl,
      ).href;

      const auth = createAuth({
        database: pool,
        kv,
        secret: Redacted.value(config.authSecret),
        baseURL: config.authUrl.origin,
        trustedOrigins: [config.webOrigin.origin],
        google: {
          clientId: config.googleClientId,
          clientSecret: Redacted.value(config.googleClientSecret),
        },
        images,
        mcp: {
          resource: gateway,
          loginPage: new URL("/sign-in", config.webOrigin).href,
          consentPage: new URL("/connections", config.webOrigin).href,
          agentCallbackPrefix,
        },
      });

      yield* Effect.tryPromise({
        try: async () =>
          registerAgentClient((await auth.$context).adapter, {
            resource: gateway,
            agentCallbackPrefix,
          }),
        catch: (cause) => new AuthError({ cause }),
      });

      const protectMcp: AuthService["protectMcp"] = (handler) =>
        requireMcpAuth(
          auth,
          async (request, claims) =>
            Option.match(decodeMcpClaims(claims), {
              // A token minted without a workspace (no consent reference) is not usable here.
              onNone: () => Response.json({ error: "invalid_token" }, { status: 403 }),
              onSome: (valid) =>
                handler(request, { userId: valid.sub, workspaceId: valid[WORKSPACE_CLAIM] }),
            }),
          { resource: gateway },
        );

      const session = Effect.fn("Auth.session")(function* (headers: Headers) {
        const result = yield* Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new AuthError({ cause }),
        });

        if (!result) return Option.none();

        const user = yield* decodeUser(result.user).pipe(
          Effect.mapError((cause) => new AuthError({ cause })),
        );

        const { activeOrganizationId } = yield* decodeActiveWorkspace(result.session).pipe(
          Effect.mapError((cause) => new AuthError({ cause })),
        );

        return Option.some<SessionInfo>({ user, activeWorkspaceId: activeOrganizationId ?? null });
      });

      const handoff = makeDesktopHandoff({
        kv,
        apiOrigin: config.authUrl,
        now: Date.now,
        startGoogle: async (callbackURL) => {
          const response = await auth.api.signInSocial({
            // Errors return to the same callback, so the app hears about them immediately.
            body: { provider: "google", callbackURL, errorCallbackURL: callbackURL },
            asResponse: true,
          });

          const { url } = await decodeRedirect(await response.json());

          return { url, cookies: response.headers.getSetCookie() };
        },
        session: async (headers) => {
          const result = await auth.api.getSession({ headers });

          return result
            ? { userId: result.user.id, createdAt: new Date(result.session.createdAt) }
            : null;
        },
        signOut: async (headers) =>
          (await auth.api.signOut({ headers, asResponse: true })).headers.getSetCookie(),
      });

      const desktopStart = (request: DesktopStart, clientIp: string | undefined) =>
        Effect.tryPromise({
          try: () => handoff.start(request, clientIp),
          catch: (cause) => new AuthError({ cause }),
        }).pipe(Effect.tapError((error) => Effect.logError("desktop sign-in start failed", error)));

      const desktopFinish = (
        headers: Headers,
        callback: DesktopCallback,
        oauthError: string | null,
      ) =>
        Effect.tryPromise({
          try: () => handoff.finish(headers, callback, oauthError),
          catch: (cause) => new AuthError({ cause }),
        }).pipe(
          Effect.tapError((error) => Effect.logError("desktop sign-in callback failed", error)),
        );

      return Auth.of({ handler: auth.handler, session, protectMcp, desktopStart, desktopFinish });
    }),
  ).pipe(Layer.provide([Postgres.layer, Kv.layer, Images.layer]));
}
