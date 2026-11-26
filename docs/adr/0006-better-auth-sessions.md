# 0006: better-auth: Google-only, Redis sessions, no cookie cache

**Status:** accepted (2026-11)

## Decision

- **Google is the only sign-in method.** First sign-in creates the account; there is no separate sign-up.
- **Sessions** live in Redis (better-auth secondary storage) for fast lookups and are also stored in Postgres to survive a cache flush.
- **No cookie cache.** It let a revoked session or deleted user stay valid until the cached cookie expired (found when wiping the dev database). Redis makes the real lookup about 1 ms. The web app re-checks the session on window focus.
- **Secret:** `BETTER_AUTH_SECRET` must be at least 32 characters; the API refuses to start otherwise, because better-auth silently uses a public default secret unless `NODE_ENV=production`.
- **Client IP:** better-auth reads only `x-crm-client-ip`, which the API sets from the TCP peer (or a loopback proxy's `x-forwarded-for`) and never trusts from clients.
- **Workspaces** are better-auth organizations (table `workspace`, required `website`). Name, website, slug and logo are validated in `organizationHooks` using the same rules as the web form (`@crm/core/workspace`). Sign-in activates the most recently joined workspace. Deletion is disabled.

## Consequences

- Invitation emails need an email provider before invites are enabled.
- Future workspace-scoped endpoints must re-check membership, not trust `activeOrganizationId` alone.
