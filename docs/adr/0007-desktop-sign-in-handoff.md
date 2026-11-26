# 0007: Desktop sign-in handoff

**Status:** accepted (2026-11). Supersedes the first design, which minted a one-time token from any existing browser session.

## Context

Google blocks OAuth inside embedded browsers, so the desktop app signs in through the system browser and must get a session back into its own window. The first design let any local process open the callback URL and receive a token for an already signed-in browser session, with no Google prompt (found in the best-practices review).

## Decision

Follow RFC 8252 (loopback redirect + state + PKCE):

1. **Start:** the app listens on `127.0.0.1:<random port>` and opens the browser at `/api/desktop/google` with `port`, `state` and a PKCE `challenge`. The API stores the attempt in Redis (10 minutes), sets an HttpOnly nonce cookie, and redirects to Google. Starting is rate-limited per IP.
2. **Callback:** the API consumes the attempt (single use), requires the nonce cookie (same browser) and a session created after the start (a fresh sign-in, never an older session). It stores a single-use code (hashed, 2 minutes) bound to the challenge, signs the browser out, and redirects to the app's loopback.
3. **Redeem:** the window posts code + verifier to `/api/auth/desktop/redeem` (a better-auth plugin endpoint, rate-limited). Only the app holds the verifier. A new desktop-only session is created.

## Consequences

The browser keeps no CRM session, and desktop and browser sessions are independent. Code: `@crm/core/auth/desktop-handoff`, `apps/api/src/services/desktop-handoff.ts`, `apps/desktop/src/main.ts`.
