import { mcp } from "@better-auth/mcp";
import { APIError } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Schema } from "effect";

/**
 * The CRM as an OAuth 2.1 authorization server for MCP (`@better-auth/mcp`). It guards one
 * protected resource, the connections gateway at `/api/mcp`, and has one client: the CRM's own
 * agent, registered by the API at startup (`agentClient`). Dynamic registration and Client ID
 * Metadata Documents stay off, so no other app can ask for a token.
 *
 * Each token is bound to the workspace that was active when the user authorized it (consent
 * reference, then the `workspace_id` claim), because connections belong to a workspace.
 */

/** Fixed client id of the CRM agent. */
export const AGENT_CLIENT_ID = "crm-agent";

const isWorkspaceId = Schema.is(Schema.NonEmptyString);

/** Access token claim with the workspace the token acts in. */
export const WORKSPACE_CLAIM = "workspace_id";

export interface McpAuthOptions {
  /** The gateway URL, such as `https://app.example/api/mcp`. Tokens are audience-bound to it. */
  resource: string;
  /** The web app's sign-in page, for an authorization that starts signed out. */
  loginPage: string;
  /** Unused while the agent is the only client (it skips consent), but required by the plugin. */
  consentPage: string;
  /**
   * The agent's sign-in callback prefix. eve adds an attempt id and token per sign-in, so the
   * agent client's redirect URIs match by prefix (see `matchesRedirect`).
   */
  agentCallbackPrefix: string;
}

/** The agent client row, written at startup by `registerAgentClient`. */
export function agentClient(options: Pick<McpAuthOptions, "agentCallbackPrefix">, now: Date) {
  return {
    clientId: AGENT_CLIENT_ID,
    name: "CRM assistant",
    redirectUris: [options.agentCallbackPrefix],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    requirePKCE: true,
    skipConsent: true,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Links the agent client to the gateway resource; tokens for a resource need this link. */
export function agentClientResource(options: Pick<McpAuthOptions, "resource">, now: Date) {
  return { clientId: AGENT_CLIENT_ID, resourceId: options.resource, createdAt: now };
}

type Where = { field: string; value: string }[];

/** A column value in the rows `registerAgentClient` writes. */
type Column = string | boolean | Date | readonly string[];

type Row = Record<string, Column>;

/** The slice of better-auth's adapter that `registerAgentClient` needs. */
export interface AuthAdapter {
  findOne<T>(query: { model: string; where: Where }): Promise<T | null>;
  create(query: { model: string; data: Row }): Promise<object>;
  update(query: { model: string; where: Where; update: Row }): Promise<object | null>;
}

/**
 * Registers (or updates) the agent client, the gateway resource, and the link between them.
 * Idempotent; the API runs it at startup so the agent's callback prefix follows `AGENT_URL`.
 */
export async function registerAgentClient(
  adapter: AuthAdapter,
  options: Pick<McpAuthOptions, "resource" | "agentCallbackPrefix">,
  now = new Date(),
) {
  const client = agentClient(options, now);
  const clientWhere = [{ field: "clientId", value: AGENT_CLIENT_ID }];

  if (await adapter.findOne({ model: "oauthClient", where: clientWhere })) {
    const { createdAt: _created, ...update } = client;

    await adapter.update({ model: "oauthClient", where: clientWhere, update });
  } else {
    await adapter.create({ model: "oauthClient", data: client });
  }

  const resourceWhere = [{ field: "identifier", value: options.resource }];

  if (!(await adapter.findOne({ model: "oauthResource", where: resourceWhere }))) {
    await adapter.create({
      model: "oauthResource",
      data: { identifier: options.resource, name: "Connections", createdAt: now, updatedAt: now },
    });
  }

  const link = agentClientResource(options, now);

  const linkWhere = [
    { field: "clientId", value: link.clientId },
    { field: "resourceId", value: link.resourceId },
  ];

  if (!(await adapter.findOne({ model: "oauthClientResource", where: linkWhere }))) {
    await adapter.create({ model: "oauthClientResource", data: link });
  }
}

/**
 * A redirect URI is allowed when it equals a registered one, or when a registered one ends in
 * `/callback/` and the URI is a path below it on the same origin. Dot segments are resolved
 * before the check, so `/callback/../x` does not pass.
 */
export function matchesRedirect(redirectUri: string, registeredUris: readonly string[]) {
  if (registeredUris.includes(redirectUri)) return true;

  if (!URL.canParse(redirectUri)) return false;

  const target = new URL(redirectUri);

  return registeredUris.some((registered) => {
    if (!registered.endsWith("/callback/") || !URL.canParse(registered)) return false;

    const prefix = new URL(registered);

    return (
      target.origin === prefix.origin &&
      target.pathname.length > prefix.pathname.length &&
      target.pathname.startsWith(prefix.pathname) &&
      target.username === "" &&
      target.password === "" &&
      target.hash === ""
    );
  });
}

export function mcpPlugins(options: McpAuthOptions) {
  return [
    // Signs MCP access tokens. The session JWT header and `/token` route are not used.
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      resource: options.resource,
      loginPage: options.loginPage,
      consentPage: options.consentPage,
      scopes: ["openid", "offline_access"],
      cachedTrustedClients: new Set([AGENT_CLIENT_ID]),
      validateRedirectUri: (redirectUri, registeredUris) =>
        matchesRedirect(redirectUri, registeredUris),
      postLogin: {
        page: options.loginPage,
        // The session's active workspace; no extra page to choose one.
        shouldRedirect: () => false,
        consentReferenceId: ({ session }) => {
          const workspaceId = session["activeOrganizationId"];

          if (!isWorkspaceId(workspaceId)) {
            throw new APIError("FORBIDDEN", {
              message: "Choose a workspace before connecting the assistant",
            });
          }

          return workspaceId;
        },
      },
      customAccessTokenClaims: ({ referenceId }) =>
        referenceId ? { [WORKSPACE_CLAIM]: referenceId } : {},
    }),
  ];
}
