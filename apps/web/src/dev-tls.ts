import { existsSync } from "node:fs";
import { join } from "node:path";

/** Where `setup:env` writes the mkcert pair for localhost, from the repo root. */
export const CERT_DIR = join(import.meta.dir, "../../../.certs");

export interface DevCert {
  readonly cert: string;
  readonly key: string;
}

/** The local certificate, when `setup:env` made one. */
export function devCert(dir = CERT_DIR): DevCert | null {
  const cert = join(dir, "localhost.pem");
  const key = join(dir, "localhost-key.pem");

  return existsSync(cert) && existsSync(key) ? { cert, key } : null;
}

/** A WebSocket frame, copied out of Bun's buffer so it outlives the callback. */
type Frame = string | Uint8Array<ArrayBuffer>;

const frame = (message: string | Buffer): Frame =>
  Buffer.isBuffer(message) ? Uint8Array.from(message) : message;

interface Socket {
  readonly target: string;
  readonly protocols: string[];
  upstream?: WebSocket;
  pending: Frame[];
}

/**
 * HTTPS with HTTP/2 in front of the dev server. Over HTTP/1.1 a browser opens at most six
 * connections to one host, and every Electric shape plus the chat stream holds one open: the
 * seventh request (a route's data, a chat's history) waits seconds for a free one. HTTP/2 puts
 * them all on one connection, as in production. Bun ignores `http2` while HMR is on, so this
 * server forwards every request, and the HMR socket, to the dev server on `inner`.
 */
export function serveHttp2Front(options: { port: number; cert: DevCert; inner: URL }) {
  return Bun.serve<Socket>({
    port: options.port,
    tls: { cert: Bun.file(options.cert.cert), key: Bun.file(options.cert.key) },
    http2: true,
    // Long polls and the chat stream stay open; the dev server and the API end them.
    idleTimeout: 0,
    fetch(request, server) {
      const url = new URL(request.url);
      const target = new URL(url.pathname + url.search, options.inner);

      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        target.protocol = "ws:";

        const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
          .split(",")
          .map((protocol) => protocol.trim())
          .filter(Boolean);

        return server.upgrade(request, { data: { target: target.href, protocols, pending: [] } })
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 });
      }

      const headers = new Headers(request.headers);

      headers.set("x-forwarded-for", server.requestIP(request)?.address ?? "127.0.0.1");
      headers.set("x-forwarded-proto", "https");

      return fetch(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
        decompress: false,
      });
    },
    websocket: {
      open(socket) {
        const upstream = new WebSocket(socket.data.target, socket.data.protocols);

        upstream.binaryType = "arraybuffer";
        upstream.addEventListener("open", () => {
          for (const message of socket.data.pending) upstream.send(message);

          socket.data.pending = [];
        });
        upstream.addEventListener("message", (event) => socket.send(event.data));
        upstream.addEventListener("close", () => socket.close());
        socket.data.upstream = upstream;
      },
      message(socket, message) {
        const upstream = socket.data.upstream;

        if (upstream?.readyState === WebSocket.OPEN) upstream.send(frame(message));
        else socket.data.pending.push(frame(message));
      },
      close(socket) {
        socket.data.upstream?.close();
      },
    },
  });
}
