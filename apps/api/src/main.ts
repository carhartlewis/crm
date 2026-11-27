import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { AppConfig } from "./config.ts";
import { Routes } from "./http/routes.ts";
import { Auth } from "./services/Auth.ts";
import { Connections } from "./services/Connections.ts";
import { Chats } from "./services/Chats.ts";
import { Companies } from "./services/Companies.ts";
import { CrmTools } from "./services/crm-tools.ts";
import { Electric } from "./services/Electric.ts";
import { Fields } from "./services/Fields.ts";
import { ChatFiles, Images } from "./services/Images.ts";
import { Intel } from "./services/Intel.ts";
import { Memory } from "./services/Memory.ts";
import { Money } from "./services/Money.ts";
import { Records } from "./services/Records.ts";
import { SavedViews } from "./services/SavedViews.ts";
import { Skills } from "./services/Skills.ts";
import { Research } from "./services/Research.ts";
import { Tracking } from "./services/Tracking.ts";

const Server = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    const Cors = HttpRouter.cors({ allowedOrigins: [config.webOrigin.origin], credentials: true });

    return HttpRouter.serve(Layer.mergeAll(Routes, Cors)).pipe(
      Layer.provide([
        Auth.layer,
        Companies.layer,
        Records.layer,
        Intel.layer,
        Fields.layer,
        Research.layer,
        Chats.layer,
        CrmTools.layer,
        Electric.layer,
        Connections.layer,
        Skills.layer,
        Memory.layer,
        Money.layer,
        SavedViews.layer,
        Images.layer,
        ChatFiles.layer,
        Tracking.layer,
      ]),
      Layer.provide(BunHttpServer.layer({ port: config.port })),
    );
  }),
);

Layer.launch(Server).pipe(BunRuntime.runMain);
