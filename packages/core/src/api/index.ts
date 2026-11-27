import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
} from "effect/http-api";

/**
 * Shared API contract. Client-safe: schemas and endpoint definitions only. The
 * server implementation lives in `apps/api`; `apps/web` derives a typed client.
 */

export class SessionUser extends Schema.Class<SessionUser>("SessionUser")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
}) {}

export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()(
  "@crm/core/api/CurrentUser",
) {}

/**
 * The session's active workspace (better-auth `activeOrganizationId`), as stored on the session.
 * Not yet checked against membership: workspace-scoped handlers verify it before use.
 */
export class CurrentSession extends Context.Service<
  CurrentSession,
  { readonly activeWorkspaceId: string | null }
>()("@crm/core/api/CurrentSession") {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/** Resolves the better-auth session cookie into `CurrentUser` and `CurrentSession`, or fails with 401. */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser | CurrentSession; requires: never }
>()("@crm/core/api/Authentication", { error: Unauthorized }) {}

export class SystemApi extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/health", { success: HttpApiSchema.NoContent }),
) {}

/** The id is not in the caller's active workspace (or does not exist). */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** The session has no active workspace, or the user is not a member of it. */
export class NoActiveWorkspace extends Schema.TaggedError<NoActiveWorkspace>()(
  "NoActiveWorkspace",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** Input that fails the shared rules (`@crm/core/company`); `message` is shown to the user. */
export class Invalid extends Schema.TaggedError<Invalid>()(
  "Invalid",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** A picture a user chose, already cropped to a square in the browser, as base64. */
export const AvatarUpload = Schema.Struct({
  image: Schema.String.check(Schema.isMaxLength(1_500_000)),
});

export class AccountApi extends HttpApiGroup.make("account")
  .add(HttpApiEndpoint.get("me", "/me", { success: SessionUser }))
  /** Stores the picture and returns its URL; the client then saves it as the user's image. */
  .add(
    HttpApiEndpoint.post("avatar", "/avatar", {
      payload: AvatarUpload,
      success: Schema.Struct({ url: Schema.String }),
      error: [Invalid],
    }),
  )
  .middleware(Authentication)
  .prefix("/account") {}

/**
 * A `company` row exactly as the Electric shape sends it: snake_case table columns, timestamps
 * as Postgres text (`2026-11-26 22:06:00.123+00`).
 */
export const Company = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  name: Schema.String,
  domain: Schema.NullOr(Schema.String),
  owner_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
});

export type Company = typeof Company.Type;

/** The Postgres transaction id of a write. The client awaits it in the shape before dropping optimistic state. */
export const TxId = Schema.Struct({ txid: Schema.Number });

export const CreateCompany = Schema.Struct({
  /** Made in the browser: `createId("com")` from `@crm/core/ids` (or a UUID from before prefixes). */
  id: Schema.String,
  name: Schema.String,
  domain: Schema.NullOr(Schema.String),
});

export const UpdateCompany = Schema.Struct({
  name: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.NullOr(Schema.String)),
});

const CompanyErrors = [NotFound, NoActiveWorkspace, Invalid];

export class CompaniesApi extends HttpApiGroup.make("companies")
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateCompany,
      success: TxId,
      error: CompanyErrors,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: UpdateCompany,
      success: TxId,
      error: CompanyErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: TxId,
      error: CompanyErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/companies") {}

/** A third-party server failed; `message` is shown to the user. */
export class UpstreamUnavailable extends Schema.TaggedError<UpstreamUnavailable>()(
  "UpstreamUnavailable",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

/** Read: the app's read-only tools. Write: all of them. See `@crm/integrations`. */
export const ConnectionAccess = Schema.Literals(["read", "write"]);

/** A connection as its owner sees it. Credentials never leave the API. */
export const Connection = Schema.Struct({
  /** Catalog id from `@crm/integrations`, such as "granola". */
  integration: Schema.String,
  access: ConnectionAccess,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type Connection = typeof Connection.Type;

const ConnectionErrors = [NotFound, NoActiveWorkspace];

/** An app people can connect: from the built-in catalog, or added by the workspace (`custom`). */
export const CatalogEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  vendor: Schema.String,
  domain: Schema.String,
  summary: Schema.String,
  custom: Schema.Boolean,
});

export type CatalogEntry = typeof CatalogEntry.Type;

/** The caller's connections in their active workspace. */
export class ConnectionsApi extends HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Connection),
      error: ConnectionErrors,
    }),
    /** The apps this workspace can connect: the built-in catalog plus its custom connectors. */
    HttpApiEndpoint.get("catalog", "/catalog", {
      success: Schema.Array(CatalogEntry),
      error: ConnectionErrors,
    }),
    /**
     * Adds a remote MCP server by URL for the whole workspace. It must offer MCP OAuth. The
     * connector reaches clients through sync (`/api/shapes/custom-connectors`).
     */
    HttpApiEndpoint.post("addCustom", "/custom", {
      payload: Schema.Struct({ name: Schema.String, url: Schema.String }),
      success: TxId,
      error: [...ConnectionErrors, Invalid, UpstreamUnavailable],
    }),
    /** Removes a custom connector, and everyone's connection to it, from the workspace. */
    HttpApiEndpoint.delete("removeCustom", "/custom/:id", {
      params: { id: Schema.String },
      success: TxId,
      error: ConnectionErrors,
    }),
    /** Each catalog app's logo in our storage (context.dev, else its favicon), by app id. */
    HttpApiEndpoint.get("logos", "/logos", {
      success: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
      error: ConnectionErrors,
    }),
    /** Starts OAuth with the app; send the browser to `url`. The callback saves the connection. */
    HttpApiEndpoint.post("authorize", "/:integration/authorize", {
      params: { integration: Schema.String },
      payload: Schema.Struct({ access: ConnectionAccess }),
      success: Schema.Struct({ url: Schema.String }),
      error: [...ConnectionErrors, UpstreamUnavailable],
    }),
    HttpApiEndpoint.patch("update", "/:integration", {
      params: { integration: Schema.String },
      payload: Schema.Struct({ access: ConnectionAccess }),
      success: TxId,
      error: ConnectionErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:integration", {
      params: { integration: Schema.String },
      success: TxId,
      error: ConnectionErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/connections") {}

export const SkillSource = Schema.Literals(["skills.sh", "custom"]);

/** A workspace skill as members see it in lists. */
export const SkillSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  source: SkillSource,
  /** The skills.sh id the copy was made from; null for custom skills. */
  sourceId: Schema.NullOr(Schema.String),
  enabled: Schema.Boolean,
  addedBy: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
  fileCount: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type SkillSummary = typeof SkillSummary.Type;

/** A skill with its instructions, to read before enabling it. */
export const SkillDetail = Schema.Struct({
  ...SkillSummary.fields,
  content: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String, size: Schema.Number })),
});

export type SkillDetail = typeof SkillDetail.Type;

/** A skills.sh search result. */
export const SkillsShResult = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  source: Schema.String,
  installs: Schema.Number,
  /** This workspace already has a copy. */
  installed: Schema.Boolean,
});

export type SkillsShResult = typeof SkillsShResult.Type;

const SkillErrors = [NotFound, NoActiveWorkspace];

/** A skill just added: its id, and the transaction to await in the synced skills. */
export const AddedSkill = Schema.Struct({ id: Schema.String, txid: Schema.Number });

/** Skills shared by everyone in the active workspace. Any member can add, enable or remove one. */
export class SkillsApi extends HttpApiGroup.make("skills")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(SkillSummary), error: SkillErrors }),
    HttpApiEndpoint.get("discover", "/discover", {
      query: { q: Schema.String },
      success: Schema.Array(SkillsShResult),
      error: [...SkillErrors, UpstreamUnavailable],
    }),
    /** A skill written (or uploaded) in the CRM. It starts enabled: its author has read it. */
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({
        name: Schema.String,
        description: Schema.String,
        content: Schema.String,
      }),
      success: AddedSkill,
      error: [...SkillErrors, Invalid],
    }),
    /** Copies a skill from skills.sh into the workspace, enabled. */
    HttpApiEndpoint.post("install", "/install", {
      payload: Schema.Struct({ sourceId: Schema.String }),
      success: AddedSkill,
      error: [...SkillErrors, Invalid, UpstreamUnavailable],
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: Schema.String },
      success: SkillDetail,
      error: SkillErrors,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: Schema.Struct({ enabled: Schema.Boolean }),
      success: TxId,
      error: SkillErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: TxId,
      error: SkillErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/skills") {}

/** Where a remembered source came from (see `@crm/memory`). */
export const MemorySourceKind = Schema.Literals([
  "website_research",
  "member_note",
  "agent_fact",
  "chat",
  "email",
]);

/** One remembered fact. Supermemory extracts facts from sources in the background. */
export const MemoryFact = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  /** Lasting (from the profile) rather than current. */
  isStatic: Schema.Boolean,
  /** Supermemory inferred it from several sources rather than reading it in one. */
  isInference: Schema.Boolean,
  createdAt: Schema.String,
});

export type MemoryFact = typeof MemoryFact.Type;

export const MemorySource = Schema.Struct({
  id: Schema.String,
  kind: Schema.NullOr(MemorySourceKind),
  title: Schema.String,
  status: Schema.Literals(["processing", "done", "failed"]),
  updatedAt: Schema.String,
});

export type MemorySource = typeof MemorySource.Type;

/** A source with its text and when it was first saved, for its record sheet. */
export const MemorySourceDetail = Schema.Struct({
  ...MemorySource.fields,
  content: Schema.String,
  createdAt: Schema.String,
});

export type MemorySourceDetail = typeof MemorySourceDetail.Type;

/** A workspace's or a company's memory, as the Workspace knowledge page and record sheet show it. */
export const Knowledge = Schema.Struct({
  /** False when the API has no memory store configured. */
  enabled: Schema.Boolean,
  /** The lasting summary (Supermemory's profile), then everything else, newest first. */
  profile: Schema.Array(Schema.Struct({ id: Schema.String, text: Schema.String })),
  facts: Schema.Array(MemoryFact),
  sources: Schema.Array(MemorySource),
});

export type Knowledge = typeof Knowledge.Type;

const GraphRelation = Schema.Literals(["updates", "extends", "derives"]);

/**
 * Sources and their facts in the shape `@supermemory/memory-graph` draws: each document is a
 * source, each memory a fact extracted from it.
 */
export const MemoryGraph = Schema.Struct({
  documents: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.NullOr(Schema.String),
      summary: Schema.NullOr(Schema.String),
      documentType: Schema.String,
      createdAt: Schema.String,
      updatedAt: Schema.String,
      memories: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          memory: Schema.String,
          content: Schema.NullOr(Schema.String),
          isStatic: Schema.Boolean,
          spaceId: Schema.String,
          isLatest: Schema.Boolean,
          isForgotten: Schema.Boolean,
          forgetAfter: Schema.NullOr(Schema.String),
          forgetReason: Schema.NullOr(Schema.String),
          version: Schema.Number,
          parentMemoryId: Schema.NullOr(Schema.String),
          rootMemoryId: Schema.NullOr(Schema.String),
          createdAt: Schema.String,
          updatedAt: Schema.String,
          relation: Schema.NullOr(GraphRelation),
          updatesMemoryId: Schema.NullOr(Schema.String),
          nextVersionId: Schema.NullOr(Schema.String),
          memoryRelations: Schema.NullOr(Schema.Record(Schema.String, GraphRelation)),
        }),
      ),
    }),
  ),
  totals: Schema.Struct({ sources: Schema.Number, facts: Schema.Number }),
});

export type MemoryGraph = typeof MemoryGraph.Type;

/** A fact that matches a search, with the source it came from. */
export const MemoryHit = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  sourceId: Schema.NullOr(Schema.String),
});

export type MemoryHit = typeof MemoryHit.Type;

const MemoryErrors = [NotFound, NoActiveWorkspace, Invalid, UpstreamUnavailable];

/** The optional company a memory call is about; without it, the workspace's own memory. */
const MemoryTarget = { companyId: Schema.optional(Schema.String) };

/**
 * Workspace and company memory. Any member reads and writes it; the memory store's key stays
 * in the API.
 */
export class MemoryApi extends HttpApiGroup.make("memory")
  .add(
    HttpApiEndpoint.get("workspace", "/", { success: Knowledge, error: MemoryErrors }),
    HttpApiEndpoint.get("graph", "/graph", {
      query: MemoryTarget,
      success: MemoryGraph,
      error: MemoryErrors,
    }),
    HttpApiEndpoint.get("search", "/search", {
      query: { ...MemoryTarget, q: Schema.String },
      success: Schema.Array(MemoryHit),
      error: MemoryErrors,
    }),
    HttpApiEndpoint.get("source", "/sources/:id", {
      params: { id: Schema.String },
      query: MemoryTarget,
      success: MemorySourceDetail,
      error: MemoryErrors,
    }),
    /** Deletes a source and every fact read from it. */
    HttpApiEndpoint.delete("deleteSource", "/sources/:id", {
      params: { id: Schema.String },
      query: MemoryTarget,
      success: HttpApiSchema.NoContent,
      error: MemoryErrors,
    }),
    HttpApiEndpoint.get("company", "/companies/:id", {
      params: { id: Schema.String },
      success: Knowledge,
      error: MemoryErrors,
    }),
    /** A note in a member's own words. Facts appear once the store has read it. */
    HttpApiEndpoint.post("addNote", "/notes", {
      payload: Schema.Struct({ ...MemoryTarget, text: Schema.String }),
      success: HttpApiSchema.NoContent,
      error: MemoryErrors,
    }),
    /** Reads the website again (context.dev) and replaces the earlier research. */
    HttpApiEndpoint.post("research", "/research", {
      payload: Schema.Struct(MemoryTarget),
      success: HttpApiSchema.NoContent,
      error: MemoryErrors,
    }),
    HttpApiEndpoint.post("forget", "/forget", {
      payload: Schema.Struct({ ...MemoryTarget, factId: Schema.String }),
      success: HttpApiSchema.NoContent,
      error: MemoryErrors,
    }),
    /**
     * Starts refreshing the workspace's stale fact copies (`MEMORY_FACTS_SYNC_PATH`) and returns
     * at once; the copies arrive through sync. ⌘K calls it when it opens.
     */
    HttpApiEndpoint.post("refresh", "/refresh", {
      success: HttpApiSchema.NoContent,
      error: MemoryErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/memory") {}

export class CrmApi extends HttpApi.make("crm")
  .add(SystemApi)
  .add(AccountApi)
  .add(CompaniesApi)
  .add(ConnectionsApi)
  .add(SkillsApi)
  .add(MemoryApi)
  .prefix("/api") {}

/**
 * Electric shape proxy for companies (a raw route in apps/api, not part of `CrmApi`). Call it
 * with `?workspace=<active workspace id>` plus Electric's protocol params; the workspace keeps
 * the URL, and so the browser cache entry, distinct per workspace.
 */
export const COMPANIES_SYNC_PATH = "/api/shapes/companies";

/**
 * The caller's own connections in the active workspace (same `?workspace=` rule). The proxy
 * leaves out the encrypted `credentials` column: tokens never leave the API.
 */
export const CONNECTIONS_SYNC_PATH = "/api/shapes/connections";

/** The active workspace's custom connectors (same `?workspace=` rule). */
export const CUSTOM_CONNECTORS_SYNC_PATH = "/api/shapes/custom-connectors";

/**
 * The active workspace's skills (same `?workspace=` rule), without each skill's extra files:
 * they can reach 1 MB per skill, so the skill sheet loads them on demand (`GET /api/skills/:id`).
 */
export const SKILLS_SYNC_PATH = "/api/shapes/skills";

/**
 * The active workspace's copied memory facts (same `?workspace=` rule): the workspace's own and
 * every company's, so ⌘K searches them locally (ADR 0017).
 */
export const MEMORY_FACTS_SYNC_PATH = "/api/shapes/memory-facts";
