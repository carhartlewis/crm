import { Predicate } from "effect";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/**
 * One-shot loopback listener for desktop sign-in (RFC 8252). Listens on 127.0.0.1 with an
 * OS-assigned port, accepts exactly one `/callback` carrying the expected `state`, and
 * resolves with the single-use handoff code. Anything else is rejected without ending the wait.
 */
export interface LoopbackSignIn {
  readonly port: number;
  readonly state: string;
  readonly code: Promise<string>;
  readonly close: () => void;
}

const page = (title: string, detail: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-weight:500">${title}</h1><p style="color:#666">${detail}</p></div>`;

function respond(response: ServerResponse, status: number, html: string) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

export function startLoopback(timeoutMs = 5 * 60_000): Promise<LoopbackSignIn> {
  const state = randomBytes(24).toString("base64url");
  const { promise: code, resolve, reject } = Promise.withResolvers<string>();

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
      respond(
        response,
        400,
        page("Invalid sign-in link", "Start signing in again from the CRM app."),
      );

      return;
    }

    const value = url.searchParams.get("code");

    if (value) {
      respond(
        response,
        200,
        page("You're signed in", "You can close this tab and return to the CRM app."),
      );
      resolve(value);
    } else {
      respond(
        response,
        401,
        page("Sign-in didn't complete", "Return to the CRM app and try again."),
      );
      reject(new Error("Google sign-in did not complete"));
    }
  });

  const timer = setTimeout(() => reject(new Error("Sign-in timed out")), timeoutMs);

  const close = () => {
    clearTimeout(timer);
    server.close();
    reject(new Error("Sign-in was cancelled"));
  };

  void code.then(close, close);

  return new Promise((ready, failed) => {
    server.once("error", (error) => {
      clearTimeout(timer);
      failed(error);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || Predicate.isString(address)) {
        failed(new Error("Loopback listener has no TCP port"));

        return;
      }

      ready({ port: address.port, state, code, close });
    });
  });
}
