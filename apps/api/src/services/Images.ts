import { createImageCache, createStorage, type ImageCache } from "@crm/core/storage";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config.ts";

/** Copies profile pictures and workspace favicons into object storage (see `@crm/core/storage`). */
export class Images extends Context.Service<Images, ImageCache>()("@crm/api/services/Images") {
  static readonly layer = Layer.effect(
    Images,
    Effect.gen(function* () {
      const { blobToken, s3 } = yield* AppConfig;

      // An empty token (a blank line copied from .env.example) means "not set".
      const configured = Option.filter(blobToken, (value) => Redacted.value(value) !== "");

      const storage = Option.match(configured, {
        onSome: (token) => createStorage({ driver: "vercel-blob", token: Redacted.value(token) }),
        onNone: () =>
          createStorage({
            driver: "s3",
            ...s3,
            secretAccessKey: Redacted.value(s3.secretAccessKey),
          }),
      });

      yield* Effect.logInfo(`image storage: ${storage.driver}`);

      return createImageCache({ storage });
    }),
  );
}
