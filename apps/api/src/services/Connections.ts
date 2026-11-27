import {
  type CatalogEntry,
  type Connection,
  Invalid,
  NoActiveWorkspace,
  NotFound,
  UpstreamUnavailable,
} from "@crm/core/api";
import type { Db } from "@crm/core/db";
import type { Kv as KvStore } from "@crm/core/kv";
import {
  type Access,
  connectorKey,
  connectorNameError,
  connectorUrlError,
  customIntegration,
  integrations,
  isAccess,
  type Integration,
} from "@crm/integrations";
import type { GatewayConnection } from "@crm/integrations/gateway";
import {
  type AuthorizationCallback,
  completeAuthorization,
  connectionAuth,
  type Credentials,
  type OAuthClientConfig,
  offersMcpOAuth,
  startAuthorization,
} from "@crm/integrations/oauth";
import { publicFetch } from "@crm/integrations/public-fetch";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../config.ts";
import { Database } from "./Database.ts";
import { Images } from "./Images.ts";
import { Kv } from "./Kv.ts";
import { transactWithTxid, type Written } from "./txid.ts";

/** A write's Postgres transaction id, for the client to await in its synced rows. */
type TxId = { readonly txid: number };

/** Who is acting: the session user and the session's (unverified) active workspace. */
export interface Actor {
  readonly userId: string;
  readonly activeWorkspaceId: string | null;
}

export interface ConnectionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly integration: string;
  readonly access: string;
  /** Sealed `Credentials` (see `Cipher`). */
  readonly credentials: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type Owner = { readonly workspaceId: string; readonly userId: string };

/** Connection rows. Every read and write is scoped to one workspace and user. */
export interface ConnectionStore {
  isMember(owner: Owner): Promise<boolean>;
  list(owner: Owner): Promise<readonly ConnectionRecord[]>;
  /** Creates the connection, or replaces its access and credentials when it exists. */
  save(
    owner: Owner,
    row: { integration: string; access: Access; credentials: string },
    now: Date,
  ): Promise<void>;
  /** Writes the browser makes return their txid (ADR 0012): it awaits it in the synced rows. */
  setAccess(
    owner: Owner,
    integration: string,
    access: Access,
    now: Date,
  ): Promise<Written<ConnectionRecord | null>>;
  setCredentials(id: string, credentials: string, now: Date): Promise<void>;
  remove(owner: Owner, integration: string): Promise<Written<boolean>>;
  /** The workspace's custom connectors. */
  customConnectors(workspaceId: string): Promise<readonly CustomConnectorRecord[]>;
  /** False when the workspace already has a connector with this key. */
  addCustom(owner: Owner, connector: CustomConnectorRecord, now: Date): Promise<Written<boolean>>;
  /** Removes the connector and every connection to it in the workspace. */
  removeCustom(workspaceId: string, key: string): Promise<Written<boolean>>;
}

export interface CustomConnectorRecord {
  readonly key: string;
  readonly name: string;
  readonly mcpUrl: string;
}

/** Encrypts credentials at rest. */
export interface Cipher {
  seal(plain: string): Promise<string>;
  open(sealed: string): Promise<string>;
}

export class ConnectionStoreError extends Schema.TaggedError<ConnectionStoreError>()(
  "ConnectionStoreError",
  { cause: Schema.Defect() },
) {}

export interface CallbackParams {
  readonly state: string | null;
  readonly code: string | null;
  readonly iss: string | null;
  readonly error: string | null;
}

export interface ConnectionsService {
  readonly list: (actor: Actor) => Effect.Effect<readonly Connection[], NoActiveWorkspace>;
  readonly catalog: (actor: Actor) => Effect.Effect<readonly CatalogEntry[], NoActiveWorkspace>;
  readonly addCustom: (
    actor: Actor,
    input: { name: string; url: string },
  ) => Effect.Effect<TxId, NoActiveWorkspace | Invalid | UpstreamUnavailable>;
  readonly removeCustom: (
    actor: Actor,
    id: string,
  ) => Effect.Effect<TxId, NoActiveWorkspace | NotFound>;
  /** Each catalog app's stored logo, by app id; null when there is none. */
  readonly logos: (
    actor: Actor,
  ) => Effect.Effect<Readonly<Record<string, string | null>>, NoActiveWorkspace>;
  readonly authorize: (
    actor: Actor,
    integration: string,
    access: Access,
  ) => Effect.Effect<{ url: string }, NoActiveWorkspace | NotFound | UpstreamUnavailable>;
  readonly update: (
    actor: Actor,
    integration: string,
    access: Access,
  ) => Effect.Effect<TxId, NoActiveWorkspace | NotFound>;
  readonly remove: (
    actor: Actor,
    integration: string,
  ) => Effect.Effect<TxId, NoActiveWorkspace | NotFound>;
  /**
   * The app's OAuth redirect. The single-use `state` binds it to the sign-in that `authorize`
   * started. `userId` is the browser's signed-in user: when there is one it must be the user who
   * started, and when there is none (the desktop app opens the system browser, which is signed
   * out) the state alone decides. Returns the Connections page with the outcome.
   */
  readonly callback: (userId: string | null, params: CallbackParams) => Effect.Effect<URL>;
  /** This app as an OAuth client of connected apps; also served as its Client ID Metadata Document. */
  readonly oauth: OAuthClientConfig;
  /** The gateway's view of a user's connections in one workspace. Empty for a non-member. */
  readonly gatewayConnections: (owner: Owner) => Promise<readonly GatewayConnection[]>;
}

export interface ConnectionsDependencies {
  readonly store: ConnectionStore;
  readonly kv: KvStore;
  readonly cipher: Cipher;
  readonly oauth: OAuthClientConfig;
  /** The web app's Connections page; the callback returns here. */
  readonly page: URL;
  readonly now: () => Date;
  readonly state: () => string;
  /** Whether a URL is an MCP server with MCP OAuth (`offersMcpOAuth`). */
  readonly checkServer: (mcpUrl: string) => Promise<boolean>;
  /** Copies a domain's logo into our storage (`ImageCache.logo`). */
  readonly logo: (website: string) => Promise<string | null>;
}

/** A sign-in in progress, from `authorize` to `callback`. */
const Pending = Schema.Struct({
  workspaceId: Schema.String,
  userId: Schema.String,
  integration: Schema.String,
  access: Schema.Literals(["read", "write"]),
  credentials: Schema.String,
});

const decodePending = Schema.decodeUnknownOption(Schema.fromJsonString(Pending));

const decodeCredentials = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      client: Schema.optional(Schema.Unknown),
      tokens: Schema.optional(Schema.Unknown),
      discovery: Schema.optional(Schema.Unknown),
      codeVerifier: Schema.optional(Schema.String),
    }),
  ),
);

const PENDING_TTL_SECONDS = 10 * 60;

// A stored logo is kept for a month; a miss is retried after a day.
const LOGO_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOGO_MISS_TTL_SECONDS = 24 * 60 * 60;
const logoKey = (domain: string) => `connections:logo:${domain}`;
const pendingKey = (state: string) => `connections:pending:${state}`;

const noWorkspace = () =>
  new NoActiveWorkspace({ message: "Choose a workspace you belong to first" });

const unknownIntegration = () => new NotFound({ message: "No such app" });
const notConnected = () => new NotFound({ message: "That app is not connected" });

/** Runs a store call; a failure is logged and becomes a defect (500). */
const run = <A>(label: string, fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new ConnectionStoreError({ cause }) }).pipe(
    Effect.tapError((error) => Effect.logError(`connections: ${label} failed`, error)),
    Effect.orDie,
  );

function toEntry(app: Integration): CatalogEntry {
  return {
    id: app.id,
    name: app.name,
    vendor: app.vendor,
    domain: app.domain,
    summary: app.summary,
    custom: !integrations.some((builtIn) => builtIn.id === app.id),
  };
}

function toConnection(record: ConnectionRecord): Connection {
  return {
    integration: record.integration,
    access: isAccess(record.access) ? record.access : "read",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function makeConnections(deps: ConnectionsDependencies): ConnectionsService {
  const { store, kv, cipher } = deps;

  /** The built-in apps plus this workspace's custom connectors. */
  const catalogFor = async (workspaceId: string): Promise<readonly Integration[]> => [
    ...integrations,
    ...(await store.customConnectors(workspaceId)).map(customIntegration),
  ];

  const findIntegration = Effect.fn("Connections.findIntegration")(function* (
    workspaceId: string,
    id: string,
  ) {
    const apps = yield* run("catalog", () => catalogFor(workspaceId));
    const app = apps.find((entry) => entry.id === id);

    if (!app) return yield* unknownIntegration();

    return app;
  });

  const owner = Effect.fn("Connections.owner")(function* (actor: Actor) {
    const workspaceId = actor.activeWorkspaceId;

    if (!workspaceId) return yield* noWorkspace();

    const member = yield* run("membership", () =>
      store.isMember({ workspaceId, userId: actor.userId }),
    );

    if (!member) return yield* noWorkspace();

    return { workspaceId, userId: actor.userId };
  });

  const seal = (credentials: Credentials) => cipher.seal(JSON.stringify(credentials));

  const open = async (sealed: string): Promise<Credentials> =>
    Option.getOrElse(
      // SAFETY: only `seal` writes these values (authenticated encryption under our secret), and
      // it seals a `Credentials`; the schema checks the outer shape, the SDK types the fields.
      decodeCredentials(await cipher.open(sealed)) as Option.Option<Credentials>,
      () => ({}),
    );

  const page = (params: Record<string, string>) => {
    const url = new URL(deps.page);

    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    return url;
  };

  const finish = async (
    app: Integration,
    pending: typeof Pending.Type,
    code: string,
    iss: string | null,
  ) => {
    const callback: AuthorizationCallback = iss ? { code, iss } : { code };

    const credentials = await completeAuthorization(
      app,
      deps.oauth,
      await open(pending.credentials),
      callback,
    );

    await store.save(
      { workspaceId: pending.workspaceId, userId: pending.userId },
      { integration: app.id, access: pending.access, credentials: await seal(credentials) },
      deps.now(),
    );
  };

  return {
    oauth: deps.oauth,

    list: Effect.fn("Connections.list")(function* (actor) {
      const scope = yield* owner(actor);

      const [rows, apps] = yield* Effect.all([
        run("list", () => store.list(scope)),
        run("catalog", () => catalogFor(scope.workspaceId)),
      ]);

      const known = new Set(apps.map((app) => app.id));

      return rows.filter((row) => known.has(row.integration)).map(toConnection);
    }),

    catalog: Effect.fn("Connections.catalog")(function* (actor) {
      const scope = yield* owner(actor);

      return (yield* run("catalog", () => catalogFor(scope.workspaceId))).map(toEntry);
    }),

    addCustom: Effect.fn("Connections.addCustom")(function* (actor, input) {
      const scope = yield* owner(actor);
      const error = connectorNameError(input.name) ?? connectorUrlError(input.url);

      if (error) return yield* new Invalid({ message: error });

      const connector = {
        key: connectorKey(input.name),
        name: input.name.trim(),
        mcpUrl: new URL(input.url.trim()).href,
      };

      const ok = yield* Effect.promise(() => deps.checkServer(connector.mcpUrl));

      if (!ok) {
        return yield* new UpstreamUnavailable({
          message: "That URL isn't an MCP server with sign-in (MCP OAuth). Check the URL.",
        });
      }

      const added = yield* run("add custom", () => store.addCustom(scope, connector, deps.now()));

      if (!added.result) {
        return yield* new Invalid({ message: "There is already a connector with this name" });
      }

      return { txid: added.txid };
    }),

    removeCustom: Effect.fn("Connections.removeCustom")(function* (actor, id) {
      const scope = yield* owner(actor);
      const removed = yield* run("remove custom", () => store.removeCustom(scope.workspaceId, id));

      if (!removed.result) return yield* new NotFound({ message: "No such connector" });

      return { txid: removed.txid };
    }),

    logos: Effect.fn("Connections.logos")(function* (actor) {
      const scope = yield* owner(actor);
      const apps = yield* run("catalog", () => catalogFor(scope.workspaceId));

      const entries = yield* run("logos", () =>
        Promise.all(
          apps.map(async (app): Promise<[string, string | null]> => {
            const cached = await kv.get(logoKey(app.domain));

            if (cached !== null) return [app.id, cached === "" ? null : cached];

            const url = await deps.logo(`https://${app.domain}`).catch(() => null);

            await kv.set(
              logoKey(app.domain),
              url ?? "",
              url ? LOGO_TTL_SECONDS : LOGO_MISS_TTL_SECONDS,
            );

            return [app.id, url];
          }),
        ),
      );

      return Object.fromEntries(entries);
    }),

    authorize: Effect.fn("Connections.authorize")(function* (actor, id, access) {
      const scope = yield* owner(actor);
      const app = yield* findIntegration(scope.workspaceId, id);
      const state = deps.state();

      const pending = yield* Effect.tryPromise({
        try: () => startAuthorization(app, deps.oauth, state),
        catch: (cause) => cause,
      }).pipe(
        Effect.tapError((cause) =>
          Effect.logWarning(`connections: ${app.id} discovery failed`, cause),
        ),
        Effect.mapError(
          () =>
            new UpstreamUnavailable({ message: `${app.name} could not be reached. Try again.` }),
        ),
      );

      yield* run("pending", async () =>
        kv.set(
          pendingKey(state),
          JSON.stringify({
            ...scope,
            integration: app.id,
            access,
            credentials: await seal(pending.credentials),
          } satisfies typeof Pending.Type),
          PENDING_TTL_SECONDS,
        ),
      );

      return { url: pending.url.href };
    }),

    update: Effect.fn("Connections.update")(function* (actor, id, access) {
      const scope = yield* owner(actor);
      const app = yield* findIntegration(scope.workspaceId, id);
      const row = yield* run("update", () => store.setAccess(scope, app.id, access, deps.now()));

      if (!row.result) return yield* notConnected();

      return { txid: row.txid };
    }),

    remove: Effect.fn("Connections.remove")(function* (actor, id) {
      const scope = yield* owner(actor);
      const app = yield* findIntegration(scope.workspaceId, id);
      const removed = yield* run("remove", () => store.remove(scope, app.id));

      if (!removed.result) return yield* notConnected();

      return { txid: removed.txid };
    }),

    callback: Effect.fn("Connections.callback")(function* (userId, params) {
      if (!params.state) return page({ error: "invalid" });

      const state = params.state;
      const raw = yield* run("pending", () => kv.take(pendingKey(state)));
      const pending = Option.getOrNull(decodePending(raw));

      if (!pending) return page({ error: "expired" });

      // A different signed-in user can't finish someone else's sign-in.
      if (userId !== null && pending.userId !== userId) return page({ error: "wrong_user" });

      const apps = yield* run("catalog", () => catalogFor(pending.workspaceId));
      const app = apps.find((entry) => entry.id === pending.integration);

      if (!app) return page({ error: "invalid" });

      if (params.error || !params.code) {
        return page({ error: params.error === "access_denied" ? "denied" : "failed", app: app.id });
      }

      const code = params.code;

      const saved = yield* Effect.tryPromise({
        try: () => finish(app, pending, code, params.iss),
        catch: (cause) => cause,
      }).pipe(
        Effect.tapError((cause) =>
          Effect.logWarning(`connections: ${app.id} token exchange failed`, cause),
        ),
        Effect.option,
      );

      return Option.isSome(saved)
        ? page({ connected: app.id })
        : page({ error: "failed", app: app.id });
    }),

    gatewayConnections: async (scope) => {
      if (!(await store.isMember(scope))) return [];

      const [rows, apps] = await Promise.all([store.list(scope), catalogFor(scope.workspaceId)]);

      const usable = rows.flatMap((row) => {
        const app = apps.find((entry) => entry.id === row.integration);

        if (!app || !isAccess(row.access)) return [];

        return [{ row, app, access: row.access }];
      });

      return Promise.all(
        usable.map(async ({ row, app, access }) => {
          const credentials = await open(row.credentials);

          return {
            integration: app,
            access,
            auth: connectionAuth(app, deps.oauth, credentials, async (renewed) =>
              store.setCredentials(row.id, await seal(renewed), deps.now()),
            ),
          };
        }),
      );
    },
  };
}

/** AES-GCM via better-auth's helper, keyed by `BETTER_AUTH_SECRET`. */
export function secretCipher(secret: string): Cipher {
  return {
    seal: (data) => symmetricEncrypt({ key: secret, data }),
    open: (data) => symmetricDecrypt({ key: secret, data }),
  };
}

/** The Prisma 8 store. */
export function prismaConnectionStore(db: Db): ConnectionStore {
  const connections = db.orm.public.Connection;

  return {
    isMember: async ({ workspaceId, userId }) =>
      (await db.orm.public.Member.where({ organizationId: workspaceId, userId }).first()) !== null,
    list: async ({ workspaceId, userId }) => await connections.where({ workspaceId, userId }).all(),
    save: async ({ workspaceId, userId }, row, now) => {
      const existing = await connections
        .where({ workspaceId, userId, integration: row.integration })
        .update({ access: row.access, credentials: row.credentials, updatedAt: now });

      if (existing) return;

      await connections.create({
        id: crypto.randomUUID(),
        workspaceId,
        userId,
        integration: row.integration,
        access: row.access,
        credentials: row.credentials,
        createdAt: now,
        updatedAt: now,
      });
    },
    setAccess: ({ workspaceId, userId }, integration, access, now) =>
      transactWithTxid(db, (tx) =>
        tx.orm.public.Connection.where({ workspaceId, userId, integration }).update({
          access,
          updatedAt: now,
        }),
      ),
    setCredentials: async (id, credentials, now) => {
      await connections.where({ id }).update({ credentials, updatedAt: now });
    },
    remove: ({ workspaceId, userId }, integration) =>
      transactWithTxid(
        db,
        async (tx) =>
          (await tx.orm.public.Connection.where({ workspaceId, userId, integration }).delete()) !==
          null,
      ),
    customConnectors: async (workspaceId) =>
      (await db.orm.public.CustomConnector.where({ workspaceId }).all()).map(
        ({ key, name, mcpUrl }) => ({ key, name, mcpUrl }),
      ),
    addCustom: ({ workspaceId, userId }, connector, now) =>
      transactWithTxid(db, async (tx) => {
        const custom = tx.orm.public.CustomConnector;

        if (await custom.where({ workspaceId, key: connector.key }).first()) return false;

        await custom.create({
          id: crypto.randomUUID(),
          workspaceId,
          key: connector.key,
          name: connector.name,
          mcpUrl: connector.mcpUrl,
          addedById: userId,
          createdAt: now,
        });

        return true;
      }),
    removeCustom: (workspaceId, key) =>
      transactWithTxid(db, async (tx) => {
        const removed = await tx.orm.public.CustomConnector.where({ workspaceId, key }).delete();

        if (removed === null) return false;

        // Everyone's connection to it goes too, in the same transaction; the agent stops seeing
        // its tools.
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- one row per member at most.
          const gone = await tx.orm.public.Connection.where({
            workspaceId,
            integration: key,
          }).delete();

          if (gone === null) return true;
        }
      }),
  };
}

export class Connections extends Context.Service<Connections, ConnectionsService>()(
  "@crm/api/services/Connections",
) {
  static readonly layer = Layer.effect(
    Connections,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const db = yield* Database;
      const kv = yield* Kv;
      const images = yield* Images;
      const api = config.authUrl;

      // Every request to an app's servers resolves the host first and refuses non-public
      // addresses: custom connectors are URLs people type.
      const oauthFetch = publicFetch();

      const oauth: OAuthClientConfig = {
        fetch: oauthFetch,
        clientName: "CRM",
        clientUri: config.webOrigin.origin,
        redirectUrl: new URL("/api/connections/callback", api).href,
        // Third-party servers must be able to fetch the document, so only on a public https URL.
        clientMetadataUrl:
          api.protocol === "https:"
            ? new URL("/api/connections/client-metadata.json", api).href
            : undefined,
      };

      return makeConnections({
        store: prismaConnectionStore(db),
        kv,
        cipher: secretCipher(Redacted.value(config.authSecret)),
        oauth,
        page: new URL("/connections", config.webOrigin),
        now: () => new Date(),
        state: () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
        logo: (website) => images.logo(website),
        checkServer: (mcpUrl) => offersMcpOAuth(mcpUrl, oauthFetch),
      });
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer, Images.layer]));
}
