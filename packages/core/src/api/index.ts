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

export class CrmApi extends HttpApi.make("crm")
  .add(SystemApi)
  .add(AccountApi)
  .add(ConnectionsApi)
  .prefix("/api") {}
