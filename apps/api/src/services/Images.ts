import {
  type ChatFiles as ChatFilesStore,
  createChatFiles,
  createImageCache,
  createStorage,
  type ImageCache,
} from "@crm/core/storage";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config.ts";
import { Brand } from "./Brand.ts";

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
      const storage = yield* appStorage;
      const brand = yield* Brand;

      yield* Effect.logInfo(`image storage: ${storage.driver}`);

      yield* Effect.logInfo(`logos: ${brand ? "context.dev" : "favicons only"}`);

      return brand
        ? createImageCache({ storage, logoSources: brand.iconUrls })
        : createImageCache({ storage });
    }),
  ).pipe(Layer.provide(Brand.layer));
}
