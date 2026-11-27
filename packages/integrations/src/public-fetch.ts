import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-only. A `fetch` that reaches public https hosts only, for requests to URLs that people
 * typed (custom connectors) and to whatever their discovery documents point at. Every request
 * resolves the hostname first and refuses loopback, private, link-local, CGNAT and other
 * non-public addresses, and redirects are not followed blindly. A short window between this
 * lookup and the connection remains (DNS rebinding); it narrows, not removes, the risk.
 */

export class BlockedAddressError extends Error {
  override readonly name = "BlockedAddressError";
}

function isPublicIPv4(address: string) {
  const [a = 0, b = 0] = address.split(".").map(Number);

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPublicIPv6(address: string) {
  const ip = address.toLowerCase();

  if (ip === "::" || ip === "::1") return false;

  // IPv4-mapped (::ffff:a.b.c.d) is judged by its IPv4 part.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);

  if (mapped) return isPublicIPv4(mapped[1] ?? "");

  return !(/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith("ff"));
}

export function isPublicAddress(address: string) {
  const family = isIP(address);

  if (family === 4) return isPublicIPv4(address);

  if (family === 6) return isPublicIPv6(address);

  return false;
}

export type Resolve = (host: string) => Promise<readonly string[]>;

const resolveAll: Resolve = async (host) =>
  (await lookup(host, { all: true })).map((entry) => entry.address);

export function publicFetch(
  base: (url: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  resolve: Resolve = resolveAll,
) {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);

    if (url.protocol !== "https:") throw new BlockedAddressError(`Refused non-https ${url.origin}`);

    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [host] : await resolve(host);

    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      throw new BlockedAddressError(`Refused non-public address for ${url.hostname}`);
    }

    // A redirect could point anywhere; surface it instead of following it.
    return base(url, { ...init, redirect: "manual" });
  };
}
