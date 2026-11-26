import { describe, expect, test } from "bun:test";
import { CLIENT_IP_HEADER, clientIp, withClientIp } from "./client-ip.ts";

describe("client IP", () => {
  test("uses the TCP peer for direct clients and ignores their forwarded headers", () => {
    expect(clientIp("203.0.113.9", "1.2.3.4")).toBe("203.0.113.9");
  });

  test("trusts the forwarded address only from a loopback proxy", () => {
    expect(clientIp("127.0.0.1", "198.51.100.7")).toBe("198.51.100.7");
    expect(clientIp("::1", " 198.51.100.7 , 10.0.0.1")).toBe("198.51.100.7");
    expect(clientIp("127.0.0.1", null)).toBe("127.0.0.1");
  });

  test("overwrites a client-supplied header", () => {
    const spoofed = new Request("http://api.test/x", {
      headers: { [CLIENT_IP_HEADER]: "6.6.6.6" },
    });

    expect(withClientIp(spoofed, "203.0.113.9").headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(withClientIp(spoofed, undefined).headers.get(CLIENT_IP_HEADER)).toBeNull();
  });
});
