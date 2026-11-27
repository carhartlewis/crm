import { describe, expect, test } from "bun:test";
import { fakeIntegration, fakeUpstream } from "./fake-upstream.ts";
import {
  completeAuthorization,
  type OAuthClientConfig,
  refreshCredentials,
  startAuthorization,
} from "./oauth.ts";

const config = (
  fetch: OAuthClientConfig["fetch"],
  clientMetadataUrl?: string,
): OAuthClientConfig => {
  const base: OAuthClientConfig = {
    redirectUrl: "https://crm.example/api/connections/callback",
    clientName: "CRM",
    fetch,
  };

  return clientMetadataUrl ? { ...base, clientMetadataUrl } : base;
};

describe("startAuthorization", () => {
  test("registers dynamically and asks for every scope the server offers", async () => {
    const upstream = fakeUpstream();

    const { url, credentials } = await startAuthorization(
      fakeIntegration,
      config(upstream.fetch),
      "state-1",
    );

    expect(url.origin + url.pathname).toBe("https://auth.notes.example/authorize");
    expect(url.searchParams.get("client_id")).toBe("registered-client");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")).toBe("notes.read notes.write offline_access");
    expect(url.searchParams.get("resource")).toBe(fakeIntegration.mcpUrl);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(upstream.registrations).toHaveLength(1);
    expect(credentials.codeVerifier).toBeString();
    expect(credentials.tokens).toBeUndefined();
  });

  test("uses the Client ID Metadata Document instead of registering when it has one", async () => {
    const upstream = fakeUpstream();
    const documentUrl = "https://crm.example/api/connections/client-metadata.json";

    const { url } = await startAuthorization(
      fakeIntegration,
      config(upstream.fetch, documentUrl),
      "state-1",
    );

    expect(url.searchParams.get("client_id")).toBe(documentUrl);
    expect(upstream.registrations).toHaveLength(0);
  });

  test("uses a pre-registered client id as is", async () => {
    const upstream = fakeUpstream();

    const { url } = await startAuthorization(
      fakeIntegration,
      { ...config(upstream.fetch), clientId: "crm-agent" },
      "state-1",
    );

    expect(url.searchParams.get("client_id")).toBe("crm-agent");
    expect(upstream.registrations).toHaveLength(0);
  });
});

describe("completeAuthorization", () => {
  test("redeems the code and keeps the tokens, not the verifier", async () => {
    const upstream = fakeUpstream();

    const { credentials } = await startAuthorization(
      fakeIntegration,
      config(upstream.fetch),
      "state-1",
    );

    const stored = await completeAuthorization(
      fakeIntegration,
      config(upstream.fetch),
      credentials,
      {
        code: "good",
      },
    );

    expect(stored.tokens?.access_token).toBe("access-1");
    expect(stored.tokens?.refresh_token).toBe("refresh-1");
    expect(stored.client?.client_id).toBe("registered-client");
    expect(stored.codeVerifier).toBeUndefined();
    expect(upstream.tokenRequests[0]?.get("code_verifier")).toBe(credentials.codeVerifier ?? "");
  });

  test("fails when the server rejects the code", async () => {
    const upstream = fakeUpstream();

    const { credentials } = await startAuthorization(
      fakeIntegration,
      config(upstream.fetch),
      "state-1",
    );

    await expect(
      completeAuthorization(fakeIntegration, config(upstream.fetch), credentials, { code: "bad" }),
    ).rejects.toThrow();
  });
});

describe("refreshCredentials", () => {
  test("trades the refresh token for a new access token", async () => {
    const upstream = fakeUpstream();
    const issuer = "https://auth.notes.example";

    const next = await refreshCredentials(fakeIntegration, config(upstream.fetch), {
      client: { client_id: "registered-client", issuer },
      tokens: { access_token: "old", token_type: "Bearer", refresh_token: "refresh-1", issuer },
    });

    expect(next.tokens?.access_token).toBe("access-1");
  });

  test("asks to reconnect when there is no refresh token", async () => {
    const upstream = fakeUpstream();

    await expect(
      refreshCredentials(fakeIntegration, config(upstream.fetch), {
        tokens: { access_token: "old", token_type: "Bearer" },
      }),
    ).rejects.toThrow("connected again");
  });
});
