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

export class AccountApi extends HttpApiGroup.make("account")
  .add(HttpApiEndpoint.get("me", "/me", { success: SessionUser }))
  .middleware(Authentication)
  .prefix("/account") {}

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
  /** Client-generated lowercase UUID (`crypto.randomUUID()`). */
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

/** The caller's connections in their active workspace. */
export class ConnectionsApi extends HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Connection),
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
      success: Connection,
      error: ConnectionErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:integration", {
      params: { integration: Schema.String },
      success: HttpApiSchema.NoContent,
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

/** Skills shared by everyone in the active workspace. Any member can add, enable or remove one. */
export class SkillsApi extends HttpApiGroup.make("skills")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(SkillSummary), error: SkillErrors }),
    HttpApiEndpoint.get("discover", "/discover", {
      query: { q: Schema.String },
      success: Schema.Array(SkillsShResult),
      error: [...SkillErrors, UpstreamUnavailable],
    }),
    /** Copies a skill from skills.sh into the workspace, disabled until someone enables it. */
    HttpApiEndpoint.post("install", "/install", {
      payload: Schema.Struct({ sourceId: Schema.String }),
      success: SkillSummary,
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
      success: SkillSummary,
      error: SkillErrors,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: HttpApiSchema.NoContent,
      error: SkillErrors,
    }),
  )
  .middleware(Authentication)
  .prefix("/skills") {}

export class CrmApi extends HttpApi.make("crm")
  .add(SystemApi)
  .add(AccountApi)
  .add(CompaniesApi)
  .add(ConnectionsApi)
  .add(SkillsApi)
  .prefix("/api") {}

/**
 * Electric shape proxy for companies (a raw route in apps/api, not part of `CrmApi`). Call it
 * with `?workspace=<active workspace id>` plus Electric's protocol params; the workspace keeps
 * the URL, and so the browser cache entry, distinct per workspace.
 */
export const COMPANIES_SYNC_PATH = "/api/shapes/companies";
