import { Context, Schema } from "effect";
import { StoredFolders, StoredPinned, StoredRecent } from "../chat/index.ts";
import { WebsiteActivity } from "../tracking/index.ts";
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

const Text = Schema.NullOr(Schema.String);
const Patchable = Schema.optional(Text);

/**
 * A PATCH body: any of a kind's editable columns (`COMPANY_FIELDS` and friends in
 * `@crm/core/records`), each a string or null. The API normalises and checks every value.
 */
const patchOf = <const Columns extends readonly string[]>(columns: Columns) =>
  // SAFETY: `fromEntries` gets exactly one `Patchable` entry per column in `columns`.
  Object.fromEntries(columns.map((column) => [column, Patchable])) as {
    readonly [K in Columns[number]]: typeof Patchable;
  };

export const CreateCompany = Schema.Struct({
  /** Made in the browser: `createId("com")` from `@crm/core/ids` (or a UUID from before prefixes). */
  id: Schema.String,
  name: Schema.String,
  domain: Text,
  owner_id: Schema.optional(Text),
});

export const UpdateCompany = Schema.Struct({
  ...patchOf([
    "name",
    "domain",
    "website",
    "phone",
    "email",
    "industry",
    "city",
    "country",
    "owner_id",
    "description",
    "linkedin_url",
    "twitter_url",
    "github_url",
    "primary_contact_id",
  ]),
  /** True archives the company (hidden from lists), false restores it. */
  archived: Schema.optional(Schema.Boolean),
});

const RecordErrors = [NotFound, NoActiveWorkspace, Invalid];

/** Create, patch and delete for one record kind: `POST /`, `PATCH /:id`, `DELETE /:id`. */
const recordEndpoints = <C extends Schema.Top, U extends Schema.Top>(create: C, update: U) =>
  [
    HttpApiEndpoint.post("create", "/", { payload: create, success: TxId, error: RecordErrors }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: update,
      success: TxId,
      error: RecordErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: TxId,
      error: RecordErrors,
    }),
  ] as const;

export class CompaniesApi extends HttpApiGroup.make("companies")
  .add(...recordEndpoints(CreateCompany, UpdateCompany))
  .add(
    /**
     * Re-enrich: copies the company's logo again and refreshes its website research, off the
     * request path. `queued` is false when the company has no domain to look up.
     */
    HttpApiEndpoint.post("enrich", "/:id/enrich", {
      params: { id: Schema.String },
      success: Schema.Struct({ queued: Schema.Boolean }),
      error: RecordErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/companies") {}

export const CreateContact = Schema.Struct({
  /** `createId("ctc")`. */
  id: Schema.String,
  first_name: Schema.String,
  last_name: Schema.optional(Text),
  email: Schema.optional(Text),
  phone: Schema.optional(Text),
  title: Schema.optional(Text),
  company_id: Schema.optional(Text),
  owner_id: Schema.optional(Text),
});

export const UpdateContact = Schema.Struct({
  ...patchOf([
    "first_name",
    "last_name",
    "title",
    "email",
    "phone",
    "linkedin_url",
    "twitter_url",
    "github_url",
    "seniority",
    "function",
    "company_id",
    "owner_id",
  ]),
  archived: Schema.optional(Schema.Boolean),
});

export class ContactsApi extends HttpApiGroup.make("contacts")
  .add(...recordEndpoints(CreateContact, UpdateContact))
  .middleware(Authentication)
  .prefix("/contacts") {}

export const CreateDeal = Schema.Struct({
  /** `createId("del")`. */
  id: Schema.String,
  name: Schema.String,
  company_id: Schema.String,
  owner_id: Schema.optional(Text),
  stage: Schema.optional(Schema.String),
  amount: Schema.optional(Text),
  currency: Schema.optional(Schema.String),
  expected_close_date: Schema.optional(Text),
});

export const UpdateDeal = Schema.Struct({
  ...patchOf([
    "name",
    "amount",
    "currency",
    "expected_close_date",
    "company_id",
    "owner_id",
    "description",
  ]),
  /** A new stage; the API stamps when it changed and logs a stage change. */
  stage: Schema.optional(Schema.String),
  /** Why a lost or unqualified deal closed; required when moving to one of those stages. */
  closed_reason: Patchable,
  archived: Schema.optional(Schema.Boolean),
});

export class DealsApi extends HttpApiGroup.make("deals")
  .add(...recordEndpoints(CreateDeal, UpdateDeal))
  .add(
    /** Puts a contact on a deal, or changes their role when already on it. */
    HttpApiEndpoint.put("attachContact", "/:id/contacts/:contactId", {
      params: { id: Schema.String, contactId: Schema.String },
      payload: Schema.Struct({ role: Schema.optional(Text) }),
      success: TxId,
      error: RecordErrors,
    }),
    HttpApiEndpoint.delete("detachContact", "/:id/contacts/:contactId", {
      params: { id: Schema.String, contactId: Schema.String },
      success: TxId,
      error: RecordErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/deals") {}

export const CreateActivity = Schema.Struct({
  /** `createId("act")`. */
  id: Schema.String,
  /** One of `LOGGED_ACTIVITY_TYPES`: note, call, email, meeting or task. */
  type: Schema.String,
  subject: Schema.optional(Text),
  body: Schema.optional(Text),
  /** ISO timestamp; now when left out. */
  occurred_at: Schema.optional(Schema.String),
  due_at: Schema.optional(Text),
  company_id: Schema.optional(Text),
  contact_id: Schema.optional(Text),
  deal_id: Schema.optional(Text),
});

export const UpdateActivity = Schema.Struct({
  subject: Patchable,
  body: Patchable,
  due_at: Patchable,
  /** Tasks: true marks it done now, false reopens it. */
  completed: Schema.optional(Schema.Boolean),
});

export class ActivitiesApi extends HttpApiGroup.make("activities")
  .add(...recordEndpoints(CreateActivity, UpdateActivity))
  .middleware(Authentication)
  .prefix("/activities") {}

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
 * The graph's core: the workspace (or the company, on its Knowledge tab) that every source links
 * back to, as in comp-neo. The record's website research is the core once it lands (ADR 0026);
 * until then the core is drawn under this id, not stored, so it never opens as a source.
 */
export const MEMORY_CORE_ID = "memory-core";

/**
 * Sources and their facts in the shape `@supermemory/memory-graph` draws: each document is a
 * source, each memory a fact extracted from it, plus the core (`MEMORY_CORE_ID`) they link to.
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

/** The caller may see the record but not change it this way; `message` is shown to the user. */
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** The agent didn't answer; the chat can't start or load right now. */
export class AgentUnavailable extends Schema.TaggedError<AgentUnavailable>()(
  "AgentUnavailable",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

/** Chats with the agent (ADR 0018). Rules in `@crm/core/chat`. */
export const CreateChat = Schema.Struct({
  /** Made in the browser: `createId("cht")`. */
  id: Schema.String,
  title: Schema.String,
  /** Null: private to the caller. */
  spaceId: Schema.NullOr(Schema.String),
  /** `manual` (the default), `auto` or `bypass` (ADR 0019). */
  permissionMode: Schema.optional(Schema.String),
  /**
   * The record the chat is about, from a record sheet's Agent tab (ADR 0024): `company`,
   * `contact` or `deal`, and its id. The agent reads it before each turn.
   */
  recordKind: Schema.optional(Schema.NullOr(Schema.String)),
  recordId: Schema.optional(Schema.NullOr(Schema.String)),
});

export const UpdateChat = Schema.Struct({
  title: Schema.optional(Schema.String),
  spaceId: Schema.optional(Schema.NullOr(Schema.String)),
  permissionMode: Schema.optional(Schema.String),
});

/** The eve session a new chat talks to, through `/api/chats/:id/agent`. */
export const ChatCreated = Schema.Struct({ txid: Schema.Number, sessionId: Schema.String });

/**
 * A chat's saved events and the stream cursor after them, for `useEveAgent`'s `initialEvents`
 * and `initialSession`. Events are eve's stream events, passed through unchanged.
 */
export const ChatHistory = Schema.Struct({
  session: Schema.Struct({ sessionId: Schema.String, streamIndex: Schema.Number }),
  events: Schema.Array(Schema.Unknown),
});

export type ChatHistory = typeof ChatHistory.Type;

const ChatErrors = [NotFound, NoActiveWorkspace, Invalid, Forbidden, AgentUnavailable];

/** A message sent while the agent works, and the task it's working on (the last request). */
export const FollowUp = Schema.Struct({
  message: Schema.String,
  task: Schema.String,
});

/** `steer` redirects the running turn now; `queue` waits for it to finish. */
export const FollowUpMode = Schema.Struct({ mode: Schema.Literals(["steer", "queue"]) });

/** A file to attach to a chat message: its name (which sets its type) and size in bytes. */
export const ChatFileStart = Schema.Struct({ filename: Schema.String, size: Schema.Number });

/** Straight to storage with a token (Vercel Blob), or through the API (development). */
export const ChatFileUpload = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("direct"),
    pathname: Schema.String,
    token: Schema.String,
    contentType: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal("api") }),
]);

/** A file's bytes as base64, for uploads through the API. */
export const ChatFileBytes = Schema.Struct({ filename: Schema.String, data: Schema.String });

/** A file the browser uploaded itself, to check. */
export const ChatFileUploaded = Schema.Struct({ filename: Schema.String, url: Schema.String });

/** A stored chat file. */
export const ChatFile = Schema.Struct({ url: Schema.String, mediaType: Schema.String });

export class ChatsApi extends HttpApiGroup.make("chats")
  .add(
    /** Keeps an eve session ready for the caller's next chat (10 minutes, in Redis). */
    HttpApiEndpoint.post("prewarm", "/prewarm", {
      success: HttpApiSchema.NoContent,
      error: ChatErrors,
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateChat,
      success: ChatCreated,
      error: ChatErrors,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: UpdateChat,
      success: TxId,
      error: ChatErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: TxId,
      error: ChatErrors,
    }),
    HttpApiEndpoint.get("history", "/:id/history", {
      params: { id: Schema.String },
      success: ChatHistory,
      error: ChatErrors,
    }),
    /** Whether a message sent mid-turn redirects the turn or waits for it (a Jev judgement). */
    HttpApiEndpoint.post("followUp", "/:id/follow-up", {
      params: { id: Schema.String },
      payload: FollowUp,
      success: FollowUpMode,
      error: ChatErrors,
    }),
    /** Starts attaching a file to a message: how the browser should send it. */
    HttpApiEndpoint.post("startFile", "/:id/files", {
      params: { id: Schema.String },
      payload: ChatFileStart,
      success: ChatFileUpload,
      error: ChatErrors,
    }),
    /** Stores a file's bytes sent through the API. */
    HttpApiEndpoint.post("storeFile", "/:id/files/bytes", {
      params: { id: Schema.String },
      payload: ChatFileBytes,
      success: ChatFile,
      error: ChatErrors,
    }),
    /** Checks a file the browser uploaded to storage itself. */
    HttpApiEndpoint.post("confirmFile", "/:id/files/confirm", {
      params: { id: Schema.String },
      payload: ChatFileUploaded,
      success: ChatFile,
      error: ChatErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/chats") {}

export const CreateSpace = Schema.Struct({
  /** Made in the browser: `createId("spc")`. */
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  /** What the space is for; may be empty. */
  description: Schema.optional(Schema.String),
});

export const UpdateSpace = Schema.Struct({
  name: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
});

export class ChatSpacesApi extends HttpApiGroup.make("chatSpaces")
  .add(
    HttpApiEndpoint.post("create", "/", { payload: CreateSpace, success: TxId, error: ChatErrors }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: UpdateSpace,
      success: TxId,
      error: ChatErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: TxId,
      error: ChatErrors,
    }),
    /** Joins the space: its chats join the caller's Recents (ADR 0020). */
    HttpApiEndpoint.post("join", "/:id/members", {
      params: { id: Schema.String },
      success: TxId,
      error: ChatErrors,
    }),
    HttpApiEndpoint.delete("leave", "/:id/members", {
      params: { id: Schema.String },
      success: TxId,
      error: ChatErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/chat-spaces") {}

/** The caller's whole sidebar row: pins, folders and the Recents order (`@crm/core/chat`). */
export const SaveSidebar = Schema.Struct({
  /** Made in the browser on the first save: `createId("sbr")`. */
  id: Schema.String,
  pinned: StoredPinned,
  folders: StoredFolders,
  /** Absent from older clients: the saved order stays as it was. */
  recentOrder: Schema.optional(StoredRecent),
});

export class SidebarApi extends HttpApiGroup.make("sidebar")
  .add(HttpApiEndpoint.put("save", "/", { payload: SaveSidebar, success: TxId, error: ChatErrors }))
  .middleware(Authentication)
  .prefix("/sidebar") {}

/** A new custom field (`@crm/core/fields`); its key is made from the label. */
export const CreateField = Schema.Struct({
  /** `createId("fdf")`. */
  id: Schema.String,
  /** `company`, `contact` or `deal`. */
  entity: Schema.String,
  label: Schema.String,
  /** One of `FIELD_TYPES`; fixed once created. */
  type: Schema.String,
  agent_filled: Schema.optional(Schema.Boolean),
  agent_brief: Schema.optional(Text),
  required: Schema.optional(Schema.Boolean),
  show_on_sheet: Schema.optional(Schema.Boolean),
  show_on_table: Schema.optional(Schema.Boolean),
  show_on_filter: Schema.optional(Schema.Boolean),
  /** Select fields: the options in order, each with a `createId("fop")` id. */
  options: Schema.optional(
    Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
  ),
});

export const UpdateField = Schema.Struct({
  label: Schema.optional(Schema.String),
  agent_filled: Schema.optional(Schema.Boolean),
  agent_brief: Patchable,
  required: Schema.optional(Schema.Boolean),
  show_on_sheet: Schema.optional(Schema.Boolean),
  show_on_table: Schema.optional(Schema.Boolean),
  show_on_filter: Schema.optional(Schema.Boolean),
  /** True archives the field (hidden everywhere, values kept), false restores it. */
  archived: Schema.optional(Schema.Boolean),
});

/** A field's value on one record. `null` clears it. Select values are option ids. */
export const PutFieldValue = Schema.Struct({
  /** `createId("fvl")` for a value the record doesn't have yet; ignored when it has one. */
  id: Schema.optional(Schema.String),
  field_id: Schema.String,
  record_id: Schema.String,
  value: Schema.NullOr(Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
});

const FieldErrors = [NotFound, NoActiveWorkspace, Invalid];

/** Custom fields of companies, contacts and deals; reads sync through the `FIELD_*` shapes. */
export class FieldsApi extends HttpApiGroup.make("fields")
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateField,
      success: TxId,
      error: FieldErrors,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: UpdateField,
      success: TxId,
      error: FieldErrors,
    }),
    /** Sets the order of an entity's fields: `ids` first to last. */
    HttpApiEndpoint.put("reorder", "/order", {
      payload: Schema.Struct({ entity: Schema.String, ids: Schema.Array(Schema.String) }),
      success: TxId,
      error: FieldErrors,
    }),
    HttpApiEndpoint.post("createOption", "/:id/options", {
      params: { id: Schema.String },
      payload: Schema.Struct({ id: Schema.String, label: Schema.String }),
      success: TxId,
      error: FieldErrors,
    }),
    HttpApiEndpoint.patch("updateOption", "/:id/options/:optionId", {
      params: { id: Schema.String, optionId: Schema.String },
      payload: Schema.Struct({
        label: Schema.optional(Schema.String),
        /** True hides the option from pickers; values that use it keep it. */
        archived: Schema.optional(Schema.Boolean),
      }),
      success: TxId,
      error: FieldErrors,
    }),
    HttpApiEndpoint.put("reorderOptions", "/:id/options/order", {
      params: { id: Schema.String },
      payload: Schema.Struct({ ids: Schema.Array(Schema.String) }),
      success: TxId,
      error: FieldErrors,
    }),
    HttpApiEndpoint.put("putValue", "/values", {
      payload: PutFieldValue,
      success: TxId,
      error: FieldErrors,
    }),
    /** "Fill the rest": the agent fills the field on every record without a value (ADR 0025). */
    HttpApiEndpoint.post("fill", "/:id/fill", {
      params: { id: Schema.String },
      success: Schema.Struct({ queued: Schema.Boolean }),
      error: FieldErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/fields") {}

/** A workspace's CRM settings (ADR 0024); the row also syncs (`WORKSPACE_SETTINGS_SYNC_PATH`). */
export const WorkspaceSettings = Schema.Struct({ reporting_currency: Schema.String });

/**
 * The reporting currency: totals add deals' amounts converted into it. Changing it converts every
 * open deal again in the same transaction.
 */
export class WorkspaceSettingsApi extends HttpApiGroup.make("workspaceSettings")
  .add(
    HttpApiEndpoint.get("get", "/", { success: WorkspaceSettings, error: RecordErrors }),
    HttpApiEndpoint.put("save", "/", {
      payload: WorkspaceSettings,
      success: TxId,
      error: RecordErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/workspace-settings") {}

/**
 * A workspace's own rate: one `currency` is `rate` units of the reporting currency. It wins over
 * the fetched rate, and open deals in that currency are converted again.
 */
export class ExchangeRatesApi extends HttpApiGroup.make("exchangeRates")
  .add(
    HttpApiEndpoint.put("setManual", "/manual/:currency", {
      params: { currency: Schema.String },
      payload: Schema.Struct({ rate: Schema.String }),
      success: TxId,
      error: RecordErrors,
    }),
    /** Goes back to the fetched rate. */
    HttpApiEndpoint.delete("clearManual", "/manual/:currency", {
      params: { currency: Schema.String },
      success: TxId,
      error: RecordErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/exchange-rates") {}

export const CreateSavedView = Schema.Struct({
  /** `createId("svw")`. */
  id: Schema.String,
  /** `company`, `contact` or `deal`. */
  entity: Schema.String,
  name: Schema.String,
  /** The list's URL query, without `?`. */
  query: Schema.String,
  shared: Schema.optional(Schema.Boolean),
});

export const UpdateSavedView = Schema.Struct({
  name: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
  shared: Schema.optional(Schema.Boolean),
});

/**
 * Saved list views. The caller owns what they create; a shared view is seen and edited by every
 * member, a personal one only by its owner.
 */
export class SavedViewsApi extends HttpApiGroup.make("savedViews")
  .add(...recordEndpoints(CreateSavedView, UpdateSavedView))
  .middleware(Authentication)
  .prefix("/saved-views") {}

/** The workspace's website tracking: its public key, or `null` while tracking is off. */
export const TrackingSettings = Schema.Struct({ key: Schema.NullOr(Schema.String) });

const TrackingErrors = [NotFound, NoActiveWorkspace];

/**
 * Website tracking for members: turn the snippet on or off, and read a company's or contact's
 * website activity (`null` when it has no visits). The snippet's own public endpoints are raw
 * routes in apps/api (`TRACKING_COLLECT_PATH`, `TRACKING_IDENTIFY_PATH`).
 */
export class TrackingApi extends HttpApiGroup.make("tracking")
  .add(
    HttpApiEndpoint.get("settings", "/", { success: TrackingSettings, error: TrackingErrors }),
    /** Turns tracking on with a new key; keeps the existing key when it is already on. */
    HttpApiEndpoint.post("enable", "/", { success: TrackingSettings, error: TrackingErrors }),
    /** Turns tracking off: the key stops working. Stored visits stay. */
    HttpApiEndpoint.delete("disable", "/", {
      success: HttpApiSchema.NoContent,
      error: TrackingErrors,
    }),
    HttpApiEndpoint.get("company", "/companies/:id", {
      params: { id: Schema.String },
      success: Schema.NullOr(WebsiteActivity),
      error: TrackingErrors,
    }),
    HttpApiEndpoint.get("contact", "/contacts/:id", {
      params: { id: Schema.String },
      success: Schema.NullOr(WebsiteActivity),
      error: TrackingErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/tracking") {}

/** A member's decision on a fact the agent proposed for a contact (ADR 0024). */
export const DecideContactFact = Schema.Struct({
  /** `applied` (the contact column already took the value) or `dismissed`. */
  status: Schema.String,
});

/** What the agent learned about records, as members act on it (ADR 0024). */
export class IntelApi extends HttpApiGroup.make("intel")
  .add(
    HttpApiEndpoint.patch("decideFact", "/contact-facts/:id", {
      params: { id: Schema.String },
      payload: DecideContactFact,
      success: TxId,
      error: RecordErrors,
    }),
  )
  .middleware(Authentication) {}

export class CrmApi extends HttpApi.make("crm")
  .add(IntelApi)
  .add(FieldsApi)
  .add(SystemApi)
  .add(AccountApi)
  .add(CompaniesApi)
  .add(ContactsApi)
  .add(DealsApi)
  .add(ActivitiesApi)
  .add(ConnectionsApi)
  .add(SkillsApi)
  .add(MemoryApi)
  .add(ChatsApi)
  .add(ChatSpacesApi)
  .add(SidebarApi)
  .add(WorkspaceSettingsApi)
  .add(ExchangeRatesApi)
  .add(SavedViewsApi)
  .add(TrackingApi)
  .prefix("/api") {}

/**
 * Electric shape proxy for companies (a raw route in apps/api, not part of `CrmApi`). Call it
 * with `?workspace=<active workspace id>` plus Electric's protocol params; the workspace keeps
 * the URL, and so the browser cache entry, distinct per workspace.
 */
export const COMPANIES_SYNC_PATH = "/api/shapes/companies";

/** The active workspace's contacts (same `?workspace=` rule). */
export const CONTACTS_SYNC_PATH = "/api/shapes/contacts";

/** The active workspace's deals (same `?workspace=` rule). */
export const DEALS_SYNC_PATH = "/api/shapes/deals";

/** Who is on each deal in the active workspace (same `?workspace=` rule). */
export const DEAL_CONTACTS_SYNC_PATH = "/api/shapes/deal-contacts";

/** The active workspace's activity: notes, calls, emails, meetings, tasks, stage changes. */
export const ACTIVITIES_SYNC_PATH = "/api/shapes/activities";

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

/**
 * Chats the caller may see in the active workspace (same `?workspace=` rule): shared ones and
 * their own private ones (ADR 0018). `session_id` stays on the server.
 */
export const CHATS_SYNC_PATH = "/api/shapes/chats";

/** The active workspace's chat spaces (same `?workspace=` rule). */
export const CHAT_SPACES_SYNC_PATH = "/api/shapes/chat-spaces";

/** Who joined each space of the active workspace (same `?workspace=` rule; ADR 0020). */
export const CHAT_SPACE_MEMBERS_SYNC_PATH = "/api/shapes/chat-space-members";

/** The caller's own sidebar row in the active workspace (same `?workspace=` rule). */
export const SIDEBAR_SYNC_PATH = "/api/shapes/sidebar";

/** The active workspace's settings row: its reporting currency (same `?workspace=` rule). */
export const WORKSPACE_SETTINGS_SYNC_PATH = "/api/shapes/workspace-settings";

/** Exchange rates: the fetched ones every workspace shares, plus the active workspace's own. */
export const EXCHANGE_RATES_SYNC_PATH = "/api/shapes/exchange-rates";

/** The active workspace's shared views and the caller's own (same `?workspace=` rule). */
export const SAVED_VIEWS_SYNC_PATH = "/api/shapes/saved-views";

/** The active workspace's custom field definitions (same `?workspace=` rule). */
export const FIELD_DEFINITIONS_SYNC_PATH = "/api/shapes/field-definitions";

/** The options of the active workspace's select fields (same `?workspace=` rule). */
export const FIELD_OPTIONS_SYNC_PATH = "/api/shapes/field-options";

/** The active workspace's custom field values (same `?workspace=` rule). */
export const FIELD_VALUES_SYNC_PATH = "/api/shapes/field-values";

/**
 * The agent proxy's prefix: `useEveAgent({ baseUrl: chatAgentBase(chatId) })`. The API checks
 * the chat and forwards `/eve/v1/session/<its session>/…` to the agent (ADR 0018).
 */
export const chatAgentBase = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}/agent`;

/** The agent's proposed facts on the active workspace's contacts (same `?workspace=` rule). */
export const CONTACT_FACTS_SYNC_PATH = "/api/shapes/contact-facts";

/** The agent's briefs on the active workspace's contacts (same `?workspace=` rule). */
export const CONTACT_BRIEFS_SYNC_PATH = "/api/shapes/contact-briefs";
