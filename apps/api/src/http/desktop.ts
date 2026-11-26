import { Option, Schema } from "effect";

/**
 * Desktop sign-in request shapes (RFC 8252 loopback redirect). The flow and its checks are in
 * services/desktop-handoff.ts and @crm/core/auth/desktop-handoff.
 */
const Port = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1024, maximum: 65_535 })),
);

const State = Schema.String.pipe(Schema.check(Schema.isPattern(/^[\w-]{16,128}$/)));
const Challenge = Schema.String.pipe(Schema.check(Schema.isPattern(/^[\w-]{43}$/)));

export class DesktopStart extends Schema.Class<DesktopStart>("DesktopStart")({
  port: Port,
  state: State,
  challenge: Challenge,
}) {}

export class DesktopCallback extends Schema.Class<DesktopCallback>("DesktopCallback")({
  port: Port,
  state: State,
}) {}

const decodeStart = Schema.decodeUnknownOption(DesktopStart);
const decodeCallback = Schema.decodeUnknownOption(DesktopCallback);

export function startFromUrl(url: URL) {
  return decodeStart({
    port: url.searchParams.get("port"),
    state: url.searchParams.get("state"),
    challenge: url.searchParams.get("challenge"),
  });
}

export function callbackFromUrl(url: URL) {
  return Option.map(
    decodeCallback({ port: url.searchParams.get("port"), state: url.searchParams.get("state") }),
    (callback) => ({ callback, oauthError: url.searchParams.get("error") }),
  );
}

/** Where Google sends the browser after sign-in (and on error): back to the API. */
export function desktopCallbackUrl(apiOrigin: URL, callback: { port: number; state: string }) {
  const url = new URL("/api/desktop/callback", apiOrigin);

  url.searchParams.set("port", String(callback.port));
  url.searchParams.set("state", callback.state);

  return url;
}

/** The app's loopback listener. Only 127.0.0.1 is ever a target, so this is not an open redirect. */
export function loopbackUrl(
  callback: { port: number; state: string },
  result: { code: string } | { error: string },
) {
  const url = new URL(`http://127.0.0.1:${callback.port}/callback`);

  url.searchParams.set("state", callback.state);

  if ("code" in result) url.searchParams.set("code", result.code);
  else url.searchParams.set("error", result.error);

  return url;
}
