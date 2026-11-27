import { createContextDev } from "@crm/core/brand";
import {
  type ChatFiles as ChatFilesStore,
  createChatFiles,
  createImageCache,
  createStorage,
  type ImageCache,
} from "@crm/core/storage";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config.ts";

/** Vercel Blob when its token is set, otherwise S3 (the local RustFS in development). */
const appStorage = Effect.gen(function* () {
  const { blobToken, s3 } = yield* AppConfig;

  // An empty token (a blank line copied from .env.example) means "not set".
  const configured = Option.filter(blobToken, (value) => Redacted.value(value) !== "");

  return Option.match(configured, {
    onSome: (token) => createStorage({ driver: "vercel-blob", token: Redacted.value(token) }),
    onNone: () =>
      createStorage({
        driver: "s3",
        ...s3,
        secretAccessKey: Redacted.value(s3.secretAccessKey),
      }),
  });
});

/**
 * Files attached to chat messages (up to 30 MB): the browser uploads to Vercel Blob itself with a
 * token, or through the API in development; the bytes are checked either way.
 */
export class ChatFiles extends Context.Service<ChatFiles, ChatFilesStore>()(
  "@crm/api/services/ChatFiles",
) {
  static readonly layer = Layer.effect(
    ChatFiles,
    Effect.map(appStorage, (storage) => createChatFiles({ storage })),
  );
}

/**
 * Copies profile pictures and logos into object storage (see `@crm/core/storage`). Logos come
 * from context.dev when its key is set, otherwise from the favicon.
 */
export class Images extends Context.Service<Images, ImageCache>()("@crm/api/services/Images") {
  static readonly layer = Layer.effect(
    Images,
    Effect.gen(function* () {
      const { contextDevApiKey } = yield* AppConfig;
      const storage = yield* appStorage;

      yield* Effect.logInfo(`image storage: ${storage.driver}`);

      const brand = Option.filter(contextDevApiKey, (value) => Redacted.value(value) !== "").pipe(
        Option.map((key) => createContextDev({ apiKey: Redacted.value(key) })),
      );

      yield* Effect.logInfo(`logos: ${Option.isSome(brand) ? "context.dev" : "favicons only"}`);

      return Option.match(brand, {
        onSome: (logos) => createImageCache({ storage, logoSources: logos.iconUrls }),
        onNone: () => createImageCache({ storage }),
      });
    }),
  );
}
