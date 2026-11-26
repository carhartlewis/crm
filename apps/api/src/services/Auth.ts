import { SessionUser } from "@crm/core/api";
import { createAuth } from "@crm/core/auth";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../config.ts";
import type { DesktopCallback, DesktopStart } from "../http/desktop.ts";
import { makeDesktopHandoff } from "./desktop-handoff.ts";
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

export interface AuthService {
  /** better-auth's Web handler for `/api/auth/*`. */
  readonly handler: (request: Request) => Promise<Response>;
  /** Resolves the session from request headers (cookie). `None` when signed out. */
  readonly session: (headers: Headers) => Effect.Effect<Option.Option<SessionInfo>, AuthError>;
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

const decodeRedirect = Schema.decodeUnknownPromise(Schema.Struct({ url: Schema.String }));

/** better-auth as an Effect service. Tests provide `Auth.of(...)` with a fake instead of this layer. */
export class Auth extends Context.Service<Auth, AuthService>()("@crm/api/services/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const pool = yield* Postgres;
      const kv = yield* Kv;

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
      });

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

      return Auth.of({ handler: auth.handler, session, desktopStart, desktopFinish });
    }),
  ).pipe(Layer.provide([Postgres.layer, Kv.layer]));
}
