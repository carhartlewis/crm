import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { AppConfig } from "./config.ts";
import { Routes } from "./http/routes.ts";
import { Auth } from "./services/Auth.ts";
import { Connections } from "./services/Connections.ts";
import { Companies } from "./services/Companies.ts";
import { Electric } from "./services/Electric.ts";
import { Images } from "./services/Images.ts";
import { Memory } from "./services/Memory.ts";
import { Skills } from "./services/Skills.ts";

const Server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    const Cors = HttpRouter.cors({ allowedOrigins: [config.webOrigin.origin], credentials: true });

    return HttpRouter.serve(Layer.mergeAll(Routes, Cors)).pipe(
      Layer.provide([
        Auth.layer,
        Companies.layer,
        Electric.layer,
        Connections.layer,
        Skills.layer,
        Memory.layer,
        Images.layer,
      ]),
      Layer.provide(BunHttpServer.layer({ port: config.port })),
    );
  }),
);

Layer.launch(Server).pipe(BunRuntime.runMain);
