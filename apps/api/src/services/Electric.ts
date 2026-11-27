import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { AppConfig } from "../config.ts";
import {
  type SyncSpec,
  electricRequestHeaders,
  electricUrlFor,
  proxyResponse,
} from "../http/sync-proxy.ts";

export class ElectricError extends Schema.TaggedError<ElectricError>()("ElectricError", {
  cause: Schema.Defect(),
}) {}

export interface ElectricService {
  /**
   * Fetches `spec` from Electric with the client's protocol params and returns the response to
   * send to the browser (status and streamed body passed through). Fails only when Electric is
   * unreachable.
   */
  readonly sync: (
    spec: SyncSpec,
    client: URLSearchParams,
    headers: Headers,
  ) => Effect.Effect<Response, ElectricError>;
}

export interface ElectricDeps {
  url: URL;
  secret: string;
  fetch: (url: URL, init: { headers: Headers; signal: AbortSignal }) => Promise<Response>;
}

export function makeElectric(deps: ElectricDeps): ElectricService {
  return {
    sync: (spec, client, headers) =>
      Effect.tryPromise({
        // The signal aborts the upstream long-poll when the browser goes away.
        try: (signal) =>
          deps.fetch(electricUrlFor(deps.url, deps.secret, client, spec), {
            headers: electricRequestHeaders(headers),
            signal,
          }),
        catch: (cause) => new ElectricError({ cause }),
      }).pipe(Effect.map(proxyResponse)),
  };
}

/** The Electric sync service behind the shape proxy. Tests provide `makeElectric` with a fake fetch. */
export class Electric extends Context.Service<Electric, ElectricService>()(
  "@crm/api/services/Electric",
) {
  static readonly layer = Layer.effect(
    Electric,
    Effect.gen(function* () {
      const config = yield* AppConfig;

      return makeElectric({
        url: config.electricUrl,
        secret: Redacted.value(config.electricSecret),
        fetch: (url, init) => fetch(url, init),
      });
    }),
  );
}
