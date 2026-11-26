import index from "../index.html";

const API_ORIGIN = new URL(Bun.env["CRM_API_URL"] ?? "http://localhost:3001");

const API_START_TIMEOUT_MS = 15_000;

/** Bun's fetch rejects with a SystemError carrying `code`; the API isn't listening yet. */
const isConnectionRefused = (error: Error) => "code" in error && error.code === "ECONNREFUSED";

/**
 * Same-origin API in dev: forward `/api/*` untouched (cookies, redirects, compression).
 * Turbo starts web and API together and the API comes up a few seconds later (it waits for
 * infra and migrations), so a refused connection is retried briefly instead of failing.
 * The client address is forwarded so better-auth can rate-limit per client.
 */
async function proxyApi(request: Request, server: Bun.Server<undefined>) {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, API_ORIGIN);
  const headers = new Headers(request.headers);
  const body = request.body ? await request.arrayBuffer() : undefined;
  const deadline = Date.now() + API_START_TIMEOUT_MS;

  headers.set("x-forwarded-for", server.requestIP(request)?.address ?? "127.0.0.1");

  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries are sequential by design.
      return await fetch(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        decompress: false,
      });
    } catch (error) {
      if (!(error instanceof Error) || !isConnectionRefused(error) || Date.now() > deadline)
        throw error;
      // oxlint-disable-next-line no-await-in-loop -- backoff between retries.
      await Bun.sleep(250);
    }
  }
}

// Bun full-stack dev server: bundles index.html on demand using the plugins in bunfig.toml.
// Every other path serves the SPA; TanStack Router takes over.
const server = Bun.serve({
  port: Number(Bun.env["PORT"] ?? 3000),
  routes: { "/api/*": proxyApi, "/*": index },
  // HMR needs patches/@tanstack%2Frouter-core (a circular import Bun's HMR registry
  // evaluates before its bindings exist). Drop the patch once fixed upstream.
  development: { hmr: true, console: true },
});

console.log(`web: ${server.url} (api → ${API_ORIGIN.origin})`);
