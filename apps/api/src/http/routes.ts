import { CrmApi, CurrentUser } from "@crm/core/api";
import { Effect, Layer, Option } from "effect";
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { Auth } from "../services/Auth.ts";
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

const ApiRoutes = HttpApiBuilder.layer(CrmApi).pipe(
  Layer.provide([SystemHandlers, AccountHandlers]),
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

/** Every HTTP route, still requiring `Auth`. `main.ts` provides the real service; tests a fake. */
export const Routes = Layer.mergeAll(ApiRoutes, AuthRoutes);
