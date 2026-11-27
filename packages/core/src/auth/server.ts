import { APIError, betterAuth, type BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import type { Kv } from "../kv/index.ts";
import { desktopHandoff } from "./desktop-handoff.ts";
import { mcpPlugins, type McpAuthOptions } from "./mcp.ts";
import {
  isWorkspaceLogo,
  isWorkspaceSlug,
  normalizeWebsite,
  normalizeWorkspaceName,
  workspaceSchema,
} from "../workspace/index.ts";

export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>;

export type AuthStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;

/** Adapts the shared KV store to better-auth's secondary storage contract. */
export function authStorage(kv: Kv): AuthStorage {
  return {
    get: (key) => kv.get(key),
    getAndDelete: (key) => kv.take(key),
    increment: (key, ttl) => kv.increment(key, ttl),
    set: (key, value, ttl) => kv.set(key, value, ttl),
    delete: (key) => kv.delete(key),
  };
}

export interface AuthDependencies {
  /** Postgres pool or adapter owned by the API process. */
  database: AuthDatabase;
  /** Session and rate-limit storage; Redis in deployed environments. */
  kv: Kv;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  /** Google OAuth client. Sign-in is Google-only; accounts are created on first sign-in. */
  google: GoogleClient;
  /** The MCP authorization server for the connections gateway (see mcp.ts). */
  mcp: McpAuthOptions;
}

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

interface WorkspaceFields {
  name?: string;
  website?: string;
}

/** Validates the name and website being written; on update, only the fields present. */
function validWorkspaceFields(
  input: { name?: string; website?: unknown; slug?: string; logo?: string | null },
  creating: boolean,
) {
  if (input.slug !== undefined && !isWorkspaceSlug(input.slug)) {
    throw new APIError("BAD_REQUEST", {
      message: "Use lowercase letters, numbers, and single hyphens",
    });
  }

  if (input.logo && !isWorkspaceLogo(input.logo)) {
    throw new APIError("BAD_REQUEST", { message: "Logo must be an https URL" });
  }

  const fields: WorkspaceFields = {};

  if (creating || input.name !== undefined) {
    const name = normalizeWorkspaceName(input.name ?? "");

    if (!name.ok) throw new APIError("BAD_REQUEST", { message: name.message });

    fields.name = name.name;
  }

  if (creating || input.website !== undefined) {
    const website = normalizeWebsite(String(input.website ?? ""));

    if (!website.ok) throw new APIError("BAD_REQUEST", { message: website.message });

    fields.website = website.url;
  }

  return fields;
}

/**
 * Workspaces are better-auth organizations, stored in the `workspace` table with a required
 * website. Name and website are re-validated here so every client gets the same rules.
 */
export const workspaces = organization({
  schema: workspaceSchema,
  creatorRole: "owner",
  organizationLimit: 10,
  membershipLimit: 200,
  disableOrganizationDeletion: true,
  organizationHooks: {
    beforeCreateOrganization: async ({ organization: workspace }) => ({
      data: { ...workspace, ...validWorkspaceFields(workspace, true) },
    }),
    beforeUpdateOrganization: async ({ organization: changes }) => ({
      data: { ...changes, ...validWorkspaceFields(changes, false) },
    }),
  },
});

/**
 * Server-only better-auth instance. Sessions are read from KV on every request (no cookie
 * cache, so revocation is immediate) and also persisted in Postgres to survive a cache flush.
 */
export function createAuth(deps: AuthDependencies) {
  return betterAuth({
    appName: "CRM",
    database: deps.database,
    secondaryStorage: authStorage(deps.kv),
    secret: deps.secret,
    baseURL: deps.baseURL,
    trustedOrigins: deps.trustedOrigins,
    socialProviders: {
      google: { ...deps.google, prompt: "select_account" },
    },
    session: {
      storeSessionInDatabase: true,
      // No cookie cache: it lets a revoked session or deleted user stay valid until the cached
      // cookie expires. Sessions are already in Redis, so a real lookup costs ~1ms.
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "secondary-storage" },
    advanced: {
      // Set by apps/api from the TCP peer (or its loopback proxy), never trusted from clients.
      ipAddress: { ipAddressHeaders: ["x-crm-client-ip"] },
    },
    databaseHooks: {
      session: {
        create: {
          // Sign-in lands in the user's most recently joined workspace, so workspace-scoped
          // endpoints work without an extra `setActive` round trip.
          before: async (session, context) => {
            if (!context) return;

            const [membership] = await context.context.adapter.findMany<{ organizationId: string }>(
              {
                model: "member",
                where: [{ field: "userId", value: session.userId }],
                sortBy: { field: "createdAt", direction: "desc" },
                limit: 1,
              },
            );

            return {
              data: { ...session, activeOrganizationId: membership?.organizationId ?? null },
            };
          },
        },
      },
    },
    plugins: [
      workspaces,
      // Desktop sign-in: system browser + loopback + PKCE (see desktop-handoff.ts).
      desktopHandoff(),
      // The agent's tokens for the connections gateway at /api/mcp.
      ...mcpPlugins(deps.mcp),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
