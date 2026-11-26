import { Authentication, CurrentUser, Unauthorized } from "@crm/core/api";
import { Effect, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/http";
import { Auth } from "../services/Auth.ts";

/** Server side of the shared `Authentication` middleware: better-auth cookie → `CurrentUser`. */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth;

    return Authentication.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        const user = yield* auth.session(new Headers(request.headers)).pipe(
          Effect.tapError((error) => Effect.logError("session lookup failed", error)),
          Effect.mapError(() => new Unauthorized({ message: "Session lookup failed" })),
        );

        if (Option.isNone(user)) {
          return yield* new Unauthorized({ message: "Not signed in" });
        }

        return yield* Effect.provideService(httpEffect, CurrentUser, user.value);
      }),
    );
  }),
);
