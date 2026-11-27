import {
  type BrandLogos,
  type CompanyResearcher,
  createContextDev,
  type WebReader,
} from "@crm/core/brand";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config.ts";
import { Kv } from "./Kv.ts";

export type BrandClient = BrandLogos & CompanyResearcher & WebReader;

/**
 * The one context.dev client: logos, research, lookups and page reads. Its answers are cached in
 * Redis without a workspace (ADR 0028), so a company or person another workspace already looked
 * up costs no second call. Null when the API has no context.dev key.
 */
export class Brand extends Context.Service<Brand, BrandClient | null>()("@crm/api/services/Brand") {
  static readonly layer = Layer.effect(
    Brand,
    Effect.gen(function* () {
      const { contextDevApiKey } = yield* AppConfig;
      const kv = yield* Kv;

      // An empty key (a blank line copied from .env.example) means "not set".
      const key = Option.filter(contextDevApiKey, (value) => Redacted.value(value) !== "");

      return Option.match(key, {
        onSome: (apiKey) => createContextDev({ apiKey: Redacted.value(apiKey), cache: kv }),
        onNone: () => null,
      });
    }),
  ).pipe(Layer.provide(Kv.layer));
}
