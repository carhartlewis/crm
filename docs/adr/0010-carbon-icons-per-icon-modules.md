# 0010: Carbon icons from per-icon modules

**Status:** accepted (2026-11)

## Context

`@carbon/icons-react` re-exports icons from ~120 kB "bucket" modules that bundlers can't tree-shake. Using it raised cold-entry JS from 103 kB to 180 kB brotli, over the 150 kB budget.

## Decision

Use `@carbon/icons` per-icon modules (`@carbon/icons/es/<name>/16.js`, about 1 kB each) rendered by `Icon` / `carbonIcon()` in `@crm/ui/components/icon`. Lint rejects `lucide-react` (which the shadcn CLI emits) and `@carbon/icons-react`.

## Consequences

After `shadcn add`, convert lucide imports to `carbonIcon(...)`. Carbon's IBM telemetry postinstall stays blocked by Bun.
