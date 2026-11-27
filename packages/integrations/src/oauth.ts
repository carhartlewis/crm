import {
  auth,
  discoverOAuthServerInfo,
  type AuthOptions,
  type FetchLike,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import type { Integration } from "./catalog.ts";

/**
 * Server-only. The OAuth client side of a connection, generic over every MCP server: the SDK's
 * `auth()` discovers the authorization server from the MCP URL (RFC 9728, RFC 8414), registers
 * this app (a Client ID Metadata Document when `clientMetadataUrl` is set, otherwise dynamic
 * client registration), and asks for every scope the server lists plus `offline_access`, so a
 * connection always gets the most the server allows. `access.ts` then narrows it to read or write.
 */

/** Everything a connection needs to call its server. Stored encrypted; never sent to clients. */
export interface Credentials {
  readonly client?: StoredOAuthClientInformation;
  readonly tokens?: StoredOAuthTokens;
  /**
   * The authorization server found at sign-in. It binds the callback to the server that issued
   * the code, and saves rediscovering it on every call.
   */
  readonly discovery?: OAuthDiscoveryState;
  /** PKCE verifier, kept only while a sign-in is pending. */
  readonly codeVerifier?: string;
}

export interface OAuthClientConfig {
  /** Where the authorization server returns the user, e.g. `https://app/api/connections/callback`. */
  readonly redirectUrl: string;
  /**
   * HTTPS URL of this app's Client ID Metadata Document (see `clientMetadata`). Leave it unset
   * where the authorization server can't fetch it, such as local development: the client then
   * registers dynamically.
   */
  readonly clientMetadataUrl?: string;
  /** A client id registered ahead of time. When set, the client never registers itself. */
  readonly clientId?: string;
  readonly clientName: string;
  readonly clientUri?: string;
  readonly fetch?: FetchLike;
}

/** The Client ID Metadata Document, served at `config.clientMetadataUrl`. */
export function clientMetadata(config: OAuthClientConfig): OAuthClientMetadata & {
  client_id?: string;
} {
  const metadata: OAuthClientMetadata & { client_id?: string } = {
    client_name: config.clientName,
    redirect_uris: [config.redirectUrl],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };

  if (config.clientMetadataUrl) metadata.client_id = config.clientMetadataUrl;

  if (config.clientUri) metadata.client_uri = config.clientUri;

  return metadata;
}

/** The server no longer accepts the stored grant; the user must connect again. */
export class ReconnectRequired extends Error {
  override readonly name = "ReconnectRequired";

  constructor(readonly integration: string) {
    super(`${integration} needs to be connected again`);
  }
}

type Mode = { kind: "interactive"; state: string } | { kind: "background"; integration: string };

/** `OAuthClientProvider` over one connection's `Credentials`. */
class CredentialsProvider implements OAuthClientProvider {
  readonly clientMetadataUrl: string | undefined;
  authorizationUrl: URL | undefined;

  constructor(
    private readonly config: OAuthClientConfig,
    public credentials: Credentials,
    private readonly mode: Mode,
    private readonly onChange: (credentials: Credentials) => Promise<void> = async () => {},
  ) {
    this.clientMetadataUrl = config.clientMetadataUrl;
  }

  get redirectUrl() {
    return this.config.redirectUrl;
  }

  get clientMetadata() {
    return clientMetadata(this.config);
  }

  state() {
    if (this.mode.kind === "background") throw new ReconnectRequired(this.mode.integration);

    return this.mode.state;
  }

  clientInformation() {
    return (
      this.credentials.client ??
      (this.config.clientId ? { client_id: this.config.clientId } : undefined)
    );
  }

  async saveClientInformation(client: StoredOAuthClientInformation) {
    await this.update({ ...this.credentials, client });
  }

  tokens() {
    return this.credentials.tokens;
  }

  async saveTokens(tokens: StoredOAuthTokens) {
    await this.update({ ...this.credentials, tokens });
  }

  redirectToAuthorization(url: URL) {
    if (this.mode.kind === "background") throw new ReconnectRequired(this.mode.integration);

    this.authorizationUrl = url;
  }

  async saveCodeVerifier(codeVerifier: string) {
    await this.update({ ...this.credentials, codeVerifier });
  }

  codeVerifier() {
    if (!this.credentials.codeVerifier) throw new Error("No sign-in is pending");

    return this.credentials.codeVerifier;
  }

  discoveryState() {
    return this.credentials.discovery;
  }

  async saveDiscoveryState(discovery: OAuthDiscoveryState) {
    await this.update({ ...this.credentials, discovery });
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") return this.update({});

    const fields = {
      client: "client",
      tokens: "tokens",
      verifier: "codeVerifier",
      discovery: "discovery",
    } as const satisfies Record<typeof scope, keyof Credentials>;

    const rest = { ...this.credentials };

    delete rest[fields[scope]];
    await this.update(rest);
  }

  private async update(credentials: Credentials) {
    this.credentials = credentials;
    await this.onChange(credentials);
  }
}

export interface PendingAuthorization {
  /** Send the user's browser here. */
  readonly url: URL;
  /** Keep until the callback (it holds the PKCE verifier), keyed by the `state` you passed. */
  readonly credentials: Credentials;
}

/**
 * Step 1 of connecting: discover the server's authorization server, register this app with it
 * if needed, and build the authorization URL. `state` must be unguessable and single-use; the
 * caller checks it on the callback.
 */
export async function startAuthorization(
  integration: Integration,
  config: OAuthClientConfig,
  state: string,
): Promise<PendingAuthorization> {
  const provider = new CredentialsProvider(config, {}, { kind: "interactive", state });

  const result = await auth(provider, { serverUrl: integration.mcpUrl, fetchFn: config.fetch });

  if (result !== "REDIRECT" || !provider.authorizationUrl) {
    throw new Error(`${integration.name} did not ask for authorization`);
  }

  return { url: provider.authorizationUrl, credentials: provider.credentials };
}

export interface AuthorizationCallback {
  readonly code: string;
  /** RFC 9207 `iss` from the callback, when the server sends it. */
  readonly iss?: string;
}

/** Step 2: redeem the callback's code. The result is what to store on the connection. */
export async function completeAuthorization(
  integration: Integration,
  config: OAuthClientConfig,
  pending: Credentials,
  callback: AuthorizationCallback,
): Promise<Credentials> {
  const provider = new CredentialsProvider(config, pending, {
    kind: "background",
    integration: integration.id,
  });

  const options: AuthOptions = {
    serverUrl: integration.mcpUrl,
    authorizationCode: callback.code,
    fetchFn: config.fetch,
  };

  if (callback.iss) options.iss = callback.iss;

  const result = await auth(provider, options);

  if (result !== "AUTHORIZED" || !provider.credentials.tokens) {
    throw new Error(`${integration.name} did not return a token`);
  }

  const { codeVerifier: _used, ...stored } = provider.credentials;

  return stored;
}

/**
 * Token source for calls to a connected server. The MCP transport refreshes expired tokens
 * through it and `onChange` persists them. When the grant is gone it throws `ReconnectRequired`
 * instead of starting a sign-in, because no one is there to complete it.
 */
export function connectionAuth(
  integration: Integration,
  config: OAuthClientConfig,
  credentials: Credentials,
  onChange: (credentials: Credentials) => Promise<void>,
): OAuthClientProvider {
  return new CredentialsProvider(
    config,
    credentials,
    { kind: "background", integration: integration.id },
    onChange,
  );
}

/**
 * Renews a connection's access token with its refresh token. Throws `ReconnectRequired` when the
 * server no longer accepts the grant.
 */
export async function refreshCredentials(
  integration: Integration,
  config: OAuthClientConfig,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.tokens?.refresh_token) throw new ReconnectRequired(integration.id);

  const provider = new CredentialsProvider(config, credentials, {
    kind: "background",
    integration: integration.id,
  });

  await auth(provider, { serverUrl: integration.mcpUrl, fetchFn: config.fetch });

  if (!provider.credentials.tokens) throw new ReconnectRequired(integration.id);

  return provider.credentials;
}

/**
 * Whether an MCP server offers MCP OAuth (RFC 9728 metadata pointing at an authorization server
 * with an authorization endpoint). Checked before a workspace saves a custom connector.
 */
export async function offersMcpOAuth(mcpUrl: string, fetch?: FetchLike) {
  try {
    const info = await discoverOAuthServerInfo(mcpUrl, fetch ? { fetchFn: fetch } : {});

    return Boolean(
      info.resourceMetadata && info.authorizationServerMetadata?.authorization_endpoint,
    );
  } catch {
    return false;
  }
}
