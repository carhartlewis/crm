import { type Connection, NoActiveWorkspace, NotFound, UpstreamUnavailable } from "@crm/core/api";
import type { Db } from "@crm/core/db";
import type { Kv as KvStore } from "@crm/core/kv";
import { type Access, integrationById, isAccess, type Integration } from "@crm/integrations";
import type { GatewayConnection } from "@crm/integrations/gateway";
import {
  type AuthorizationCallback,
  completeAuthorization,
  connectionAuth,
  type Credentials,
  type OAuthClientConfig,
  startAuthorization,
} from "@crm/integrations/oauth";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { AppConfig } from "../config.ts";
import { Database } from "./Database.ts";
import { Kv } from "./Kv.ts";

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
  setAccess(
    owner: Owner,
    integration: string,
    access: Access,
    now: Date,
  ): Promise<ConnectionRecord | null>;
  setCredentials(id: string, credentials: string, now: Date): Promise<void>;
  remove(owner: Owner, integration: string): Promise<boolean>;
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
  readonly authorize: (
    actor: Actor,
    integration: string,
    access: Access,
  ) => Effect.Effect<{ url: string }, NoActiveWorkspace | NotFound | UpstreamUnavailable>;
  readonly update: (
    actor: Actor,
    integration: string,
    access: Access,
  ) => Effect.Effect<Connection, NoActiveWorkspace | NotFound>;
  readonly remove: (
    actor: Actor,
    integration: string,
  ) => Effect.Effect<void, NoActiveWorkspace | NotFound>;
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

function findIntegration(id: string) {
  return Option.match(Option.fromNullishOr(integrationById(id)), {
    onNone: () => Effect.fail(unknownIntegration()),
    onSome: Effect.succeed,
  });
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
      const rows = yield* run("list", () => store.list(scope));

      return rows.filter((row) => integrationById(row.integration)).map(toConnection);
    }),

    authorize: Effect.fn("Connections.authorize")(function* (actor, id, access) {
      const scope = yield* owner(actor);
      const app = yield* findIntegration(id);
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
      const app = yield* findIntegration(id);
      const row = yield* run("update", () => store.setAccess(scope, app.id, access, deps.now()));

      if (!row) return yield* notConnected();

      return toConnection(row);
    }),

    remove: Effect.fn("Connections.remove")(function* (actor, id) {
      const scope = yield* owner(actor);
      const app = yield* findIntegration(id);
      const removed = yield* run("remove", () => store.remove(scope, app.id));

      if (!removed) return yield* notConnected();
    }),

    callback: Effect.fn("Connections.callback")(function* (userId, params) {
      if (!params.state) return page({ error: "invalid" });

      const state = params.state;
      const raw = yield* run("pending", () => kv.take(pendingKey(state)));
      const pending = Option.getOrNull(decodePending(raw));

      if (!pending) return page({ error: "expired" });

      // A different signed-in user can't finish someone else's sign-in.
      if (userId !== null && pending.userId !== userId) return page({ error: "wrong_user" });

      const app = integrationById(pending.integration);

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

      const rows = await store.list(scope);

      const usable = rows.flatMap((row) => {
        const app = integrationById(row.integration);

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
      connections.where({ workspaceId, userId, integration }).update({ access, updatedAt: now }),
    setCredentials: async (id, credentials, now) => {
      await connections.where({ id }).update({ credentials, updatedAt: now });
    },
    remove: async ({ workspaceId, userId }, integration) =>
      (await connections.where({ workspaceId, userId, integration }).delete()) !== null,
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
      const api = config.authUrl;

      const oauth: OAuthClientConfig = {
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
      });
    }),
  ).pipe(Layer.provide([Database.layer, Kv.layer]));
}
