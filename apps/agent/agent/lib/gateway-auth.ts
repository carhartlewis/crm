import type { Kv } from "@crm/core/kv";
import type { Integration } from "@crm/integrations";
import {
  completeAuthorization,
  type Credentials,
  type OAuthClientConfig,
  refreshCredentials,
  startAuthorization,
} from "@crm/integrations/oauth";
import type { FetchLike } from "@modelcontextprotocol/client";
import {
  ConnectionAuthorizationFailedError,
  ConnectionAuthorizationRequiredError,
  type ConnectionPrincipal,
  defineInteractiveAuthorization,
} from "eve/connections";
import { Option, Schema } from "effect";

/**
 * Sign-in to the CRM's connections gateway (`/api/mcp`). The CRM is the authorization server
 * (better-auth MCP); this agent is its pre-registered public client `crm-agent`, so the user
 * only confirms once in the browser and the CRM skips consent. Tokens are kept per user in
 * Redis and renewed with the refresh token; eve asks the user to sign in again only when the
 * grant is gone.
 */

export const CONNECTION_NAME = "connections";
const CLIENT_ID = "crm-agent";

/** Renew this long before the access token expires. */
const EARLY_RENEWAL_MS = 60_000;

/** Matches better-auth's default refresh token lifetime. */
const STORE_TTL_SECONDS = 30 * 24 * 60 * 60;

const Stored = Schema.fromJsonString(
  Schema.Struct({ credentials: Schema.Unknown, expiresAt: Schema.Number }),
);

const decodeStored = Schema.decodeUnknownOption(Stored);

/** Carried by eve from `startAuthorization` to `completeAuthorization`; credentials as JSON. */
type Resume = { state: string; credentials: string };

const decodeResume = Schema.decodeUnknownOption(
  Schema.Struct({ state: Schema.String, credentials: Schema.String }),
);

export interface GatewayAuthOptions {
  /** The gateway URL, `<CRM_API_URL>/api/mcp`. */
  readonly gatewayUrl: string;
  readonly kv: Kv;
  readonly now?: () => number;
  readonly fetch?: FetchLike;
}

function userId(principal: ConnectionPrincipal) {
  if (principal.type !== "user") {
    throw new ConnectionAuthorizationFailedError(CONNECTION_NAME, {
      reason: "principal_required",
      retryable: false,
    });
  }

  return principal.id;
}

function tokenKey(user: string) {
  return `agent:gateway-token:${user}`;
}

function randomState() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function gatewayAuth(options: GatewayAuthOptions) {
  const now = options.now ?? Date.now;

  const gateway: Integration = {
    id: CONNECTION_NAME,
    name: "CRM connections",
    vendor: "CRM",
    domain: new URL(options.gatewayUrl).host,
    summary: "",
    description: "",
    mcpUrl: options.gatewayUrl,
  };

  const config = (redirectUrl: string): OAuthClientConfig => ({
    clientId: CLIENT_ID,
    clientName: "CRM assistant",
    redirectUrl,
    fetch: options.fetch,
  });

  async function save(user: string, credentials: Credentials) {
    const lifetime = credentials.tokens?.expires_in ?? 3600;
    const expiresAt = now() + lifetime * 1000;

    await options.kv.set(
      tokenKey(user),
      JSON.stringify({ credentials, expiresAt }),
      STORE_TTL_SECONDS,
    );

    return { token: credentials.tokens?.access_token ?? "", expiresAt };
  }

  return defineInteractiveAuthorization<Resume>({
    displayName: "CRM",

    async getToken({ principal }) {
      const user = userId(principal);
      const stored = Option.getOrNull(decodeStored(await options.kv.get(tokenKey(user))));
      // SAFETY: only `save` writes this key, and it stores a `Credentials` value.
      const credentials = stored?.credentials as Credentials | undefined;
      const token = credentials?.tokens?.access_token;

      if (!stored || !credentials || !token) {
        throw new ConnectionAuthorizationRequiredError(CONNECTION_NAME);
      }

      if (stored.expiresAt - EARLY_RENEWAL_MS > now())
        return { token, expiresAt: stored.expiresAt };

      try {
        // The redirect URL is not used for a refresh.
        return await save(
          user,
          await refreshCredentials(gateway, config(options.gatewayUrl), credentials),
        );
      } catch {
        await options.kv.delete(tokenKey(user));

        throw new ConnectionAuthorizationRequiredError(CONNECTION_NAME);
      }
    },

    async evict({ principal }) {
      await options.kv.delete(tokenKey(userId(principal)));
    },

    async startAuthorization({ callbackUrl }) {
      const state = randomState();
      const pending = await startAuthorization(gateway, config(callbackUrl), state);

      return {
        challenge: { url: pending.url.href, displayName: "CRM" },
        resume: { state, credentials: JSON.stringify(pending.credentials) },
      };
    },

    async completeAuthorization({ principal, callbackUrl, resume, callback }) {
      const user = userId(principal);
      const pending = Option.getOrNull(decodeResume(resume));
      const { code, state, iss, error } = callback.params;

      if (error === "access_denied") {
        throw new ConnectionAuthorizationFailedError(CONNECTION_NAME, {
          reason: "access_denied",
          retryable: false,
        });
      }

      if (!pending || !code || state !== pending.state) {
        throw new ConnectionAuthorizationFailedError(CONNECTION_NAME, {
          reason: "invalid_callback",
        });
      }

      // SAFETY: `resume.credentials` is the JSON of the `Credentials` that `startAuthorization`
      // returned above; eve stores it server-side and hands it back unchanged.
      const pendingCredentials = JSON.parse(pending.credentials) as Credentials;

      const credentials = await completeAuthorization(
        gateway,
        config(callbackUrl),
        pendingCredentials,
        { code, iss },
      );

      return save(user, credentials);
    },
  });
}
