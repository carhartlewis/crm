# 0004: Effect HttpApi contract, not tRPC

**Status:** accepted (2026-11)

## Context

The backend is Effect v4. Clients need end-to-end types. tRPC was suggested for mutations.

## Decision

- The API contract (schemas, endpoints, `Authentication` middleware) lives in `@crm/core/api`, client-safe. `apps/api` implements it; clients derive a typed client from the same definition.
- No tRPC: it would be a second API layer and contract, and its React mutations are TanStack Query underneath anyway.
- In the web app, server state uses TanStack Query (`queryOptions` / `mutationOptions` per resource). Auth and workspace operations call better-auth's endpoints through its client.

## Consequences

One contract, typed from server to client. Mutation ergonomics come from `useMutation` with shared `mutationOptions`, not from the transport.
