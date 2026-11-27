# 0003: shadcn/ui on Tailwind v4, not StyleX

**Status:** accepted (2026-11)

## Context

The original stack proposal listed StyleX for extracted CSS alongside shadcn/ui. shadcn/ui is built on Tailwind, and `@shadcn/lint` enforces Tailwind theme tokens.

## Decision

Use shadcn/ui components in `packages/ui` styled with Tailwind v4 tokens and variants. StyleX is not used. Appearance lives in component variants and theme tokens; call sites use layout classes only (lint: `shadcn/no-restyle`, `no-arbitrary-values`, `no-raw-colors`).

## Consequences

One styling system. Motion and selection rules are tokens and component variants too (see `AGENTS.md`). First-view CSS was about 13 kB brotli against a 20 kB budget; the budget is 50 kB since the agent chat UI (2026-11).
