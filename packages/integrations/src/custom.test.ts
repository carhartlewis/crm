import { describe, expect, test } from "bun:test";
import {
  connectorDomain,
  connectorKey,
  connectorNameError,
  connectorUrlError,
  customIntegration,
} from "./custom.ts";
import { fakeIntegration, fakeUpstream } from "./fake-upstream.ts";
import { offersMcpOAuth } from "./oauth.ts";
import { isPublicAddress, publicFetch } from "./public-fetch.ts";

describe("custom connector rules", () => {
  test("names become keys and can't take a catalog app's id", () => {
    expect(connectorKey("Linear Issues!")).toBe("linear-issues");
    expect(connectorNameError("Linear")).toBeUndefined();
    expect(connectorNameError("Granola")).toContain("already");
    expect(connectorNameError("  ")).toBeDefined();
    expect(connectorNameError("!!!")).toBeDefined();
  });

  test("URLs must be https on a public hostname", () => {
    expect(connectorUrlError("https://mcp.linear.app/mcp")).toBeUndefined();
    expect(connectorUrlError("http://mcp.linear.app/mcp")).toBe("Use an https URL");

    for (const url of [
      "https://localhost/mcp",
      "https://127.0.0.1/mcp",
      "https://[::1]/mcp",
      "https://printer.local/mcp",
      "https://intranet/mcp",
      "https://db.internal/mcp",
    ]) {
      expect(connectorUrlError(url)).toBe("Use the server's public hostname");
    }

    expect(connectorUrlError("https://user:pass@mcp.example.com/mcp")).toBeDefined();
  });

  test("a custom connector looks up its logo by the vendor's domain", () => {
    expect(connectorDomain("https://mcp.linear.app/mcp")).toBe("linear.app");
    expect(connectorDomain("https://example.com/mcp")).toBe("example.com");
    expect(
      customIntegration({ key: "linear", name: "Linear", mcpUrl: "https://mcp.linear.app/mcp" }),
    ).toMatchObject({ id: "linear", vendor: "linear.app", domain: "linear.app" });
  });
});

describe("offersMcpOAuth", () => {
  test("is true for an MCP OAuth server and false otherwise", async () => {
    const upstream = fakeUpstream();

    expect(await offersMcpOAuth(fakeIntegration.mcpUrl, upstream.fetch)).toBe(true);
    expect(await offersMcpOAuth("https://nothing.example/mcp", upstream.fetch)).toBe(false);
  });
});

const ok = async () => new Response("ok");

describe("publicFetch", () => {
  test("reaches public addresses only, over https, without following redirects", async () => {
    let init: RequestInit | undefined;

    const fetch = publicFetch(
      async (_url, options) => {
        init = options;

        return new Response("ok");
      },
      async (host) => (host === "good.example" ? ["93.184.216.34"] : ["10.0.0.5"]),
    );

    expect(await (await fetch("https://good.example/mcp")).text()).toBe("ok");
    expect(init?.redirect).toBe("manual");
    await expect(fetch("https://evil.example/mcp")).rejects.toThrow("non-public");
    await expect(fetch("http://good.example/mcp")).rejects.toThrow("non-https");
    await expect(publicFetch(ok, async () => [])("https://127.0.0.1/x")).rejects.toThrow();
  });

  test("classifies addresses", () => {
    for (const address of [
      "10.1.2.3",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }

    for (const address of ["93.184.216.34", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });
});
