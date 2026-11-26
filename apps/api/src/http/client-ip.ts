/**
 * Client IP for better-auth (rate limiting, session tracking). better-auth reads only
 * CLIENT_IP_HEADER, which this API always overwrites, so a client cannot spoof it.
 * A forwarded address is trusted only from a loopback peer: the local dev proxy (apps/web)
 * or a reverse proxy on the same host. Configure the deployment's proxy to set
 * `x-forwarded-for` to the single client address, replacing any client value.
 */
export const CLIENT_IP_HEADER = "x-crm-client-ip";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function clientIp(peer: string | undefined, forwardedFor: string | null) {
  const forwarded = forwardedFor?.split(",")[0]?.trim();

  return peer && LOOPBACK.has(peer) && forwarded ? forwarded : peer;
}

export function withClientIp(request: Request, ip: string | undefined) {
  const headers = new Headers(request.headers);

  headers.delete(CLIENT_IP_HEADER);

  if (ip) headers.set(CLIENT_IP_HEADER, ip);

  // Built field by field: in Bun, `new Request(request, { headers })` keeps the original headers.
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal,
  };

  // A streamed body requires half-duplex.
  if (request.body) init.duplex = "half";

  return new Request(request.url, init);
}
