import { APIError, betterAuth, type AuthContext, type BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { Schema } from "effect";
import type { Kv } from "../kv/index.ts";
import type { ImageCache } from "../storage/index.ts";
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
  /** Copies profile pictures and workspace logos into storage. Omit to keep remote URLs. */
  images?: ImageCache;
  /** Calls Google's userinfo endpoint for a missing profile picture. Defaults to `fetch`. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** The MCP authorization server for the connections gateway (see mcp.ts). */
  mcp: McpAuthOptions;
  /**
   * Runs after a workspace is created, without delaying the response: the API researches its
   * website into workspace memory. Must not throw.
   */
  onWorkspaceCreated?: (workspaceId: string) => void;
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

/** The website's logo (or favicon) URL in storage, or `undefined` when it can't be fetched. */
async function faviconFor(images: ImageCache | undefined, website: string | undefined) {
  if (!images || !website) return undefined;

  return images.logo(website).catch(() => undefined);
}

/**
 * Workspaces are better-auth organizations, stored in the `workspace` table with a required
 * website. Name and website are re-validated here so every client gets the same rules.
 * Without an explicit logo, a workspace takes its website's logo (context.dev), else its favicon.
 */
export function workspaces(images?: ImageCache, onCreated?: (workspaceId: string) => void) {
  return organization({
    schema: workspaceSchema,
    creatorRole: "owner",
    organizationLimit: 10,
    membershipLimit: 200,
    disableOrganizationDeletion: true,
    organizationHooks: {
      beforeCreateOrganization: async ({ organization: workspace }) => {
        const data = { ...workspace, ...validWorkspaceFields(workspace, true) };

        if (!data.logo) {
          const logo = await faviconFor(images, data.website);

          if (logo) data.logo = logo;
        }

        return { data };
      },
      afterCreateOrganization: async ({ organization: workspace }) => {
        onCreated?.(workspace.id);
      },
      beforeUpdateOrganization: async ({ organization: changes }) => {
        const data = { ...changes, ...validWorkspaceFields(changes, false) };

        // A new website brings its own logo, unless this update also sets one.
        if (data.logo === undefined) {
          const logo = await faviconFor(images, data.website);

          if (logo !== undefined) data.logo = logo;
        }

        return { data };
      },
    },
  });
}

/**
 * On sign-in, copies the user's (Google) profile picture into storage, and gives the active
 * workspace its website's favicon if it has no logo yet. Both happen once: later sign-ins
 * find the stored URLs.
 */
export async function cacheSignInImages(
  images: ImageCache,
  context: AuthContext,
  userId: string,
  workspaceId: string | null,
  fetchImpl: NonNullable<AuthDependencies["fetch"]> = fetch,
) {
  const user = await context.internalAdapter.findUserById(userId);
  const source = user && (user.image || (await googlePicture(context, user.id, fetchImpl)));

  if (user && source && !images.isStored(source)) {
    const image = await images.avatar(user.id, source);

    if (image) await context.internalAdapter.updateUser(user.id, { image });
  }

  if (!workspaceId) return;

  const workspace = await context.adapter.findOne<{ logo?: string | null; website?: string }>({
    model: "organization",
    where: [{ field: "id", value: workspaceId }],
  });

  if (!workspace || workspace.logo || !workspace.website) return;

  const logo = await images.logo(workspace.website);

  if (logo) {
    await context.adapter.update({
      model: "organization",
      where: [{ field: "id", value: workspaceId }],
      update: { logo },
    });
  }
}

const decodeUserInfo = Schema.decodeUnknownSync(
  Schema.Struct({ picture: Schema.optional(Schema.String) }),
);

/**
 * Google can leave `picture` out of the ID token (seen for a Workspace account with a ~1.5 kB
 * photo URL), and better-auth reads only the ID token, so the user is saved without an image.
 * The userinfo endpoint still returns it, for the access token stored at sign-in.
 */
async function googlePicture(
  context: AuthContext,
  userId: string,
  fetchImpl: NonNullable<AuthDependencies["fetch"]>,
) {
  const accounts = await context.internalAdapter.findAccounts(userId);
  const accessToken = accounts.find((account) => account.providerId === "google")?.accessToken;

  if (!accessToken) return null;

  const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  return decodeUserInfo(await response.json()).picture ?? null;
}

/** Failures only log: images are a nicety and never block sign-in. */
async function cacheSignInImagesSafely(
  images: ImageCache,
  context: AuthContext,
  userId: string,
  workspaceId: string | null,
  fetchImpl: AuthDependencies["fetch"],
) {
  try {
    await cacheSignInImages(images, context, userId, workspaceId, fetchImpl);
  } catch (error) {
    context.logger.warn("Couldn't cache sign-in images", error);
  }
}

const decodeActiveWorkspace = Schema.decodeUnknownSync(
  Schema.Struct({ activeOrganizationId: Schema.optional(Schema.NullOr(Schema.String)) }),
);

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
          after: async (session, context) => {
            const { images } = deps;

            if (!context || !images) return;

            const { activeOrganizationId } = decodeActiveWorkspace(session);

            await context.context.runInBackgroundOrAwait(
              cacheSignInImagesSafely(
                images,
                context.context,
                session.userId,
                activeOrganizationId ?? null,
                deps.fetch,
              ),
            );
          },
        },
      },
    },
    plugins: [
      workspaces(deps.images, deps.onWorkspaceCreated),
      // Desktop sign-in: system browser + loopback + PKCE (see desktop-handoff.ts).
      desktopHandoff(),
      // The agent's tokens for the connections gateway at /api/mcp.
      ...mcpPlugins(deps.mcp),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
