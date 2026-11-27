<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `bunx --no-install --package @tanstack/intent intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx --no-install --package @tanstack/intent intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Engineering workflow

- Use the Bun canary channel (`bun upgrade --canary`, 1.4.5 minimum) and the committed lockfile. Read `docs/engineering.md` before tooling, CI, UI, or performance work.
- Run `bun run check` after changes and fix failures. It runs lint, formatting validation, typechecks, tests, and builds concurrently.
- Oxlint owns linting; Biome owns formatting (`bun run fmt`). Do not add overlapping ESLint/Prettier policies to new packages.
- Use `bun:test`, explicit dependency injection, and meaningful behavior tests. Never commit focused tests or silence errors to pass checks.
- Add a `check-types` script using `bun check --no-script` in each new source package. Register actual build outputs and dependencies with Turbo.
- Keep UI appearance in component variants/theme tokens. Use layout classes at call sites and maintain per-app shadcn discovery settings.
- Preserve installed skills as vendor content. Do not format or lint `.agents/skills/` or `.claude/skills/` or run their example tests.
- After adding or upgrading a dependency that ships agent skills (TanStack Router/DB, `@electric-sql/client`, `react-doctor`), run `bunx @tanstack/intent install` so the version-matched skills are wired in. Prefer these over registry copies. `effect` and `eve` ship docs instead: read `node_modules/effect/AGENTS.md` and `node_modules/eve/docs/README.md`.

## Product and architecture

A desktop-first CRM. Optimise for keyboard and mouse first; touch must work but is secondary.

### Workspaces

- `apps/web`: React 19 client, bundled and served by Bun (`Bun.serve` HTML imports and `bun build`). No Vite.
- `apps/api`: Effect backend (HTTP API, auth, writes, Electric shape proxy).
- `apps/desktop`: Electron shell. It loads the web app and adds a small preload bridge (`@crm/core/desktop`). Run with `turbo dev --filter=@crm/desktop` (web and API start alongside via `with`).
- `apps/agent`: Eve agent that powers AI chat. Read `node_modules/eve/docs/README.md` before writing Eve code.
- `packages/ui`: shared shadcn/ui components (Tailwind v4 tokens and variants). Consumers import `@crm/ui/<component>`.
- `packages/core`: shared domain code with explicit subpath exports. Client-safe: `@crm/core/api` (Effect HttpApi contract, schemas, `Authentication` middleware definition) and `@crm/core/auth/client`. Server-only: `@crm/core/auth` (better-auth factory), `@crm/core/db` (Prisma 8 client), `@crm/core/kv` (Redis KV and preloader), `@crm/core/brand` (context.dev logos; key injected as `CONTEXT_DEV_API_KEY` in the API). Never import server-only subpaths from `apps/web`.
- Local infrastructure is part of the Turbo graph. `turbo dev` (or any `--filter` that includes `@crm/api`) runs `//#infra:up` (`docker compose up -d --wait`: Postgres 17 with logical replication on 55432, Redis on 56379), then `@crm/core#db:migrate` (refuses non-local database hosts unless `ALLOW_REMOTE_MIGRATE=1`), then the servers. Use Turbo commands, not ad-hoc scripts. Copy each `.env.example` to `.env`; `bun run infra:down` stops the containers.
- Internal packages are Turborepo Just-in-Time packages: `exports` point at `.ts`/`.tsx` source, there is no package build step, and the app bundler compiles them. Do not author `.js`/`.mjs`/`.cjs` files; config files are TypeScript or JSON.
- Apps depend on packages only through declared `workspace:*` dependencies and public exports. Never import another workspace's `src/` by path.

### Effect

Before writing Effect code, read `node_modules/effect/AGENTS.md` and the installed source. Effect v4 APIs differ from older training data. Model errors as typed failures, inject services through layers, and validate every external boundary with `Schema`.

### Data and sync

- Prisma 8 (`@prisma/orm-postgres`, release candidate) owns the schema and every migration, including better-auth's tables, in `packages/core/src/prisma/contract.prisma`. Use the `prisma-8` skill; it overrides anything you remember about Prisma 7 (`schema.prisma`, `@prisma/client`). Commit the emitted `contract.json`/`contract.d.ts` and `migrations/`. Never reset or drop a database. better-auth reads and writes through the same `pg.Pool`; keep its tables in sync with `getAuthTables` when auth plugins change.
- Postgres is the source of truth. Use TanStack DB collections synced through ElectricSQL for CRM records so reads, filters, and sorts are local (`useLiveQuery`).
- Writes are optimistic. Collection mutation handlers call the Effect API, which writes in a transaction and returns the Postgres `txid`; the client awaits that txid before dropping optimistic state. Server rejection rolls back.
- Electric shapes are requested through the Effect API so auth and row filtering stay server-side. Never expose the Electric service directly.
- Each shape fixes its table, row filter and, where a table holds secrets or bulk data, its columns (`connection.credentials` and `skill.files` never sync). Per-workspace collections go through `perWorkspace` in `apps/web/src/lib/sync-collections.ts` so workspace switches and sign-out release them. See ADR 0012.
- Use TanStack Query (one shared `QueryClient`, one `queryOptions` definition per resource) only for data that is not synced: search, AI, third-party APIs.

### Workspaces

- A workspace is a better-auth organization (organization plugin, table `workspace`). In UI copy and new code, say "workspace"; better-auth's API stays `organization.*`.
- The schema (`workspaceSchema`) and the name and website rules (`normalizeWorkspaceName`, `normalizeWebsite`) live in `@crm/core/workspace`. The server plugin enforces them in `organizationHooks`; the web form uses the same functions for inline errors.
- Signed-in users without a workspace go to `/setup-workspace`. Sign-in activates the most recently joined workspace (session `create.before` hook). Workspace deletion is disabled.
- Invitation emails are not configured yet; add `sendInvitationEmail` with an email provider before enabling invites.

### Auth and cache

- better-auth via `createAuth` from `@crm/core/auth`, wrapped as the Effect `Auth` service in `apps/api`. better-auth owns `/api/auth/*`; every other endpoint is an HttpApi endpoint, and protected groups use the shared `Authentication` middleware, which provides `CurrentUser`. Other services (the Eve agent) verify sessions by forwarding the cookie to `/api/account/me`, never by reading auth tables.
- Inject the Postgres pool, KV store, secret, base URL, and trusted origins; never read env vars inside `packages/core`.
- Redis through Bun's native `RedisClient` (no client dependency), wrapped by `createRedisKv` with a `crm` key prefix and colon-separated keys. It backs better-auth sessions and rate limits, plus read-through preloading (`createPreloader`) for hot payloads such as the Cmd+K index. Always set a TTL on cached data.
- `BETTER_AUTH_SECRET` must be at least 32 characters; the API refuses to start otherwise (better-auth would silently use its public default secret).
- Keep better-auth's `session.cookieCache` disabled. It lets revoked sessions and deleted users stay valid until the cached cookie expires; Redis already makes the real lookup fast. The web app re-checks the session on window focus (`SessionWatcher`) and returns to sign-in when it's gone.
- Tests use `createMemoryKv` with an injected clock. Do not mock modules.
- Images go through `@crm/core/storage` (server-only): Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise S3 through Bun's `S3Client` (local RustFS in compose on 59000, bucket `crm`, only `public/` is anonymously readable). On sign-in, the auth hook copies the Google avatar to `users/<id>/avatar` and gives a workspace without a logo its website favicon (`favicons/<host>`, from Google's favicon service so the server never fetches user-supplied URLs). Only PNG, JPEG, GIF, WebP and ICO are kept. Tests use `createMemoryStorage`. Storage origins must be in the desktop CSP `img-src`.

### Routing, URL state, and prefetching

- TanStack Router with file-based routes. Bun has no router bundler plugin: generate the route tree with `@tanstack/router-cli` and split heavy routes with `.lazy.tsx` files.
- Set `defaultPreload: 'intent'`, `defaultPreloadDelay: 50`, `defaultPreloadStaleTime: 0`. Disable preloading on low-value links.
- Route loaders start critical data while the route chunk downloads. Read it with suspense; give secondary panels their own Suspense boundaries.
- Predict navigation from pointer movement: ForesightJS for primary navigation, plus the native `PointerEvent.getPredictedEvents()` delegate for `a[data-prefetch]` links. Both call the same `router.preloadRoute` entry point, feature-detect, skip `saveData`, and dedupe.
- Use nuqs (TanStack Router adapter) for UI overlay state such as open sheets (`?person=<id>`), tabs, and filters, so every view is linkable and back-button safe. Route-level params that loaders depend on stay in router `validateSearch`. Never write the same key from both.
- Code-split components with `preloadable()` (`@crm/ui/lib/preloadable`), not `React.lazy`: call `.preload()` on deliberate hover, focus, or press (or when idle for keyboard-first tools like ⌘K), and it renders synchronously once loaded instead of waiting a scheduler tick. Load rarely used tools on demand.
- ForesightJS runs with `setDataAttributes: false`: its default `data-active`/`data-status` attributes collide with component variants and TanStack Router.

### Connections (ADR 0013)

- `@crm/integrations` holds the catalog of connectable apps (remote MCP servers), generic MCP OAuth (`./oauth`) and the gateway (`./gateway`). Add an app with one catalog entry; never add per-app scopes or tool lists.
- Access is `read` (tools with `readOnlyHint: true`) or `write` (all tools). OAuth always asks for every scope the server offers.
- Workspace skills: a pinned copy from skills.sh (`@crm/integrations/skills-sh`), shared by the workspace, disabled until a member enables it. The agent loads enabled ones per turn from `/api/agent/skills`.
- Logos for apps and workspaces come from context.dev by domain and are copied into our storage (`ImageCache.logo`); the favicon is the fallback. Never hotlink or bundle vendor logos.
- Upstream tokens stay in the API, encrypted. The agent reaches apps only through `/api/mcp`, with a better-auth MCP token for the `crm-agent` client; keep its eve connection file named `connections`.

### Memory (ADR 0014)

- `@crm/memory` (server-only) holds the memory store interface, the Supermemory adapter, Jev's questions and thresholds, and the recall format. Tests use `createInMemoryStore` from `@crm/memory/testing`.
- One Supermemory namespace per workspace and per company (`memoryNamespace`). The API's `Memory` service is the only writer; it checks membership and keeps `SUPERMEMORY_API_KEY`. Members use `/api/memory/*`, the agent `/api/agent/memory/*` with its MCP token.
- Members see memory as the memory graph (`@crm/ui/patterns/memory-graph`, loaded with `preloadable()`): Workspace settings → Workspace Memory, and each company's Knowledge tab.
- New workspaces and companies with a domain are researched through context.dev (`@crm/core/brand` `research`) into one `website-research` source.
- The agent's `crm` memory slot recalls before each turn, saves every chat, and asks Jev (`experimental_decide`, `typesafe-ai/jev` on the AI Gateway, `AI_GATEWAY_API_KEY`) which messages and sent emails become facts. Judging stays in the agent. Keep the member's words; never summarise them into a fact.

### Desktop (Electron)

- Preconnect to the app origin before the window exists (`session.preconnect`). Native addons stay external to the main bundle and are required through `createRequire(<app path>/package.json)`: Bun bakes `import.meta.url` and `__dirname` into the build as source paths.
- Follow the Electron security checklist; `apps/desktop/src/security.ts` holds the tested policy. Keep `contextIsolation`, `sandbox` (plus `app.enableSandbox()`), no `nodeIntegration`, no `webview`, a CSP on the app origin, and deny-by-default permissions.
- The renderer only shows the app origin. External links go through `shell.openExternal`, and only `https:` and `mailto:` are allowed.
- The preload exposes a minimal typed bridge, never `ipcRenderer` itself. Every IPC handler checks that the sender is the app's top-level frame.
- Desktop sign-in follows RFC 8252: Google in the system browser (Google blocks embedded sign-in), a loopback redirect to `127.0.0.1`, `state`, and PKCE. The API binds each attempt to the starting browser (HttpOnly nonce) and to a fresh sign-in, hands the app a single-use hashed code, and signs the browser out. The window redeems code + verifier at `/api/auth/desktop/redeem` for its own desktop-only session. Never mint codes from an existing browser session. See `@crm/core/auth/desktop-handoff` and `apps/api/src/services/desktop-handoff.ts`.
- Packaging (Electron Forge or electron-builder, fuses, code signing, auto-update) is not set up yet. Add it before the first release.

### React: no direct effects, data before render

- No `useEffect`, `useLayoutEffect` or `useInsertionEffect` (lint: `crm/no-direct-effect`, a local Oxlint plugin in `tools/oxlint`). Follow the `no-use-effect` skill: derive values during render, act in event handlers, reset with `key`, and read browser state through `useSyncExternalStore`.
- **Data before render.** The app is client-rendered by design, so the equivalent of SSR-first loading is route-first: load in `beforeLoad`/`loader` with `queryClient.fetchQuery(queryOptions)` and read with `useSuspenseQuery`. Never fetch in effects.
- The only escape hatch is `useMountEffect` (`@crm/ui/hooks/use-mount-effect`), for subscribing to an external system on mount. Use `useEffectEvent` inside it to read the latest props.
- Forms use TanStack Form with `revalidateLogic` and `onDynamic` field validators that reuse the shared rules from `@crm/core`, and submit through TanStack Query `mutationOptions` (`useMutation`). No hand-rolled field-error or pending state.
- Async actions (sign-in, sign-out, saves, retries) run through `useMutation`. Server calls go in shared `mutationOptions` in `src/lib`. Read pending and error state from the mutation (`isPending`, `onError`), or from a form's `isSubmitting` when it awaits the mutation. Never copy that state into `useState`. When success means the page leaves (a redirect, or guards that re-run), use `loading={mutation.isPending || mutation.isSuccess}`. Never put temporary state (pending, errors) in the URL; nuqs is only for view state that people can link to.
- Routes nest in directories with a `route.tsx` layout. Each pathless layout guards once: `_guest` (signed out), `_authed` (signed in; puts `session` in route context), `_authed/_workspace` (has a workspace). Put new pages under the layout whose guard they need. On a session change, `SessionWatcher` calls `router.invalidate()` and the guards redirect; never navigate by hand for auth state (ADR 0011). Query keys come from `authKeys`; user data is keyed by user id.

### Motion and selection

Global rules. Use the tokens and components; never one-off timings.

- **Tokens** (`packages/ui/src/styles/globals.css`): `ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) for UI enter, exit and presses; `ease-in-out` for on-screen movement; `ease-drawer` for sheets. Bare `transition-*` defaults to 150ms `ease-out`. Never `ease-in`. UI motion stays under 300ms; modals, drawers, sheets and toasts are the exceptions.
- **Screens enter** with `animate-enter` (fade plus 8px rise, 300ms), staggered in at most four groups with `enter-delay-1` to `enter-delay-4`. Put it on a wrapper, not on a `@crm/ui` component (lint enforces this).
- **Routes cross-fade** via TanStack Router `defaultViewTransition` (200ms).
- **Buttons** press to `scale-97` (160ms). Async actions use `<Button loading>`, which fades in a spinner, keeps the width, sets `aria-busy` and disables the button. Don't swap labels to "Loading…". Field errors animate in through `FieldError`.
- **Never animate** keyboard-initiated or high-frequency actions (Cmd+K, shortcuts, list navigation). Use the `animate`, `review-animations` and `remove-animations` skills when designing or reviewing motion.
- **Reduced motion** ships with every animation: opacity-only, never zero (`prefers-reduced-motion` rules in globals.css). Spinners keep spinning.
- **Selection:** interface chrome is not selectable, through `select-none` in the component itself: buttons, labels, tabs, badges, kbd, cards, dialogs, sheets, menus, popovers, peeks, tooltips, the command palette, the sidebar, and onboarding screens. CRM content (names, emails, notes, values, record titles) stays copyable: mark it `select-text`, including inside cards. Inputs and textareas are always `select-text`.

### Text wrapping

- Headings and titles balance their lines (`text-wrap: balance`); running text uses `text-wrap: pretty`. `globals.css` applies both to `h1`–`h6`, `p`, `li` and the `*-title` / `*-description` slots of shared components. Text in a `div` or `span` that reads as a title or a paragraph adds `text-balance` or `text-pretty`.
- Menus, popovers and tooltips fit their text: never give them a fixed width that wraps their items.

### Interaction rules

- **Icons:** Carbon only, from per-icon modules: `import close from "@carbon/icons/es/close/16.js"` and `const CloseIcon = carbonIcon(close)` (`@crm/ui/components/icon`). Don't use `@carbon/icons-react`: its bucket modules defeat tree-shaking. The shadcn CLI emits `lucide-react`; convert after `shadcn add`. Lint rejects both.

- **Workspace shell** (`apps/web/src/components/shell`): sidebar with Home and the pinned pages (`lib/pages.ts`; order per user in `lib/pinned-order.ts`), drag-to-reorder with a haptic tick per slot (`reorder.ts`, zero renders while dragging), rubber-band overscroll (`rubber-band.ts`), peek cards on hover that warm their chunk and data, and the sidebar toggle leading each page header (`WorkspacePageHeader`, on the title's line; the header is the window's title bar). Shortcuts live in `lib/shortcuts.ts` (⌘K, ⌘B, ⌘[ ⌘], ⌥0 Home, ⌥1–⌥9 pinned pages), bound with `react-hotkeys-hook` in `components/shell/shortcuts.tsx` (match on `event.code`; pass a deps array). The sidebar's open state and width live in the `sidebar_state` and `sidebar_width` cookies (`@crm/ui/components/sidebar`), not React state. Its edge (`SidebarRail`) resizes as in Glass: drag 200–400 px (sticks at 256, resists past the limits, collapses past the minimum and reopens when dragged back, a haptic at each), click to collapse, arrow keys to resize, Escape to cancel; no renders while dragging (`@crm/ui/lib/sidebar-width`).
- **Settings** (`/settings/*`, groups in `lib/settings.ts`): the workspace menu's Settings submenu opens Personal settings (`/settings/account`) or Workspace settings (`/settings`). Inside settings the sidebar swaps from the pinned pages to `SettingsNav`. Pages use `SettingsPage`.
- **Haptics:** `haptic()` (`apps/web/src/lib/haptics.ts`) calls the desktop bridge, which plays the macOS trackpad alignment pattern through the optional `macos-haptics` addon (loaded lazily in main, throttled, a no-op elsewhere). Use it for snaps and slot changes, not for every hover.
- **Card text never wraps.** Titles, descriptions and meta lines stay on one line and truncate (`truncate`, plus `min-w-0` in flex or grid) as the card narrows. `CardTitle` and `CardDescription` do it; custom lines in a card do it themselves, with icons, badges and separators `shrink-0`.
- **Cards** carry the border beam (`@crm/ui/components/border-beam`, monochrome), running only while the card has pointer or focus interest.
- **Pages and record lists** use the vms.dev patterns in `@crm/ui/patterns`: `PageShell` (owns `<main>` and scrolling; `SidebarInset` is a fixed frame), `DataTable` with `useListTable` (columns ordered by `kind`, settings-gear column visibility, Filters/Sort, row `…` menu via `RecordRowMenu`, selection with bulk actions, responsive "Table options" at narrow widths), and `RecordSheet` opened through `useRecordSheetParams` (`?company=<id>`). Don't restyle them at call sites; change the pattern.
- **Hotkeys open sheets from anywhere.** Create sheets are mounted once in the shell (`components/shell/create-sheets.tsx`) with their state in the URL (`?create=<kind>`, `lib/create-sheet.ts`), and their hotkeys are global (`components/shell/shortcuts.tsx`). New company is ⌘C, which only creates when nothing is selected and no field has focus (`claimsCopyShortcut`); otherwise it copies. Add new create sheets the same way.
- **Hotkey hints live in tooltips, never inside a button's label.** Wrap every control that has a hotkey in `HotkeyTooltip` (`components/hotkey-tooltip.tsx`): its label plus the keys, as in Glass.
- **List keys** (`components/records/use-list-keys.ts`, pure model in `lib/list-navigation.ts`): j/k/↓/↑ move, g g / ⇧G ends, Enter/o open, x select, ⇧j/⇧k extend, Escape clears, / focuses search. They drive `DataTable`'s `activeRowId` and the table's own selection, and are enabled only while no sheet or dialog is open (derived from that state, including `?create`, not toggled scopes).
- **Synced records**: one TanStack DB collection per workspace (`lib/companies.ts` is the model), shape URL carries `?workspace=` so caches never cross workspaces, writes are optimistic and await the txid, and `releaseSynced` (`lib/synced.ts`) stops old syncs on workspace switch and sign-out. Route loaders start the sync through a dynamic import so TanStack DB stays out of cold entry.
- **Cmd+K:** shadcn `Command`. Data is prefetched and kept fresh (sync engine, SSE, or polling); results are contextual to the current page. Do your own ranking and pass `shouldFilter={false}` for large sets. Slight backdrop blur only.
- **AI chat:** stream assistant markdown with `@pierre/words` (`Markdown` with `isAnimating` while streaming). Wrap the composer in `border-beam`'s `BorderBeam` via a `packages/ui` component, not ad hoc in the app.
- **Emoji picker:** preload the catalog on the first `:`; open after two letters at a word boundary; rank exact, prefix, word, then substring; one row per glyph; the caret stays in the editor.
- **Gestures and menus:** zero React renders while dragging (refs and direct style writes). Animate only `transform` and `opacity`. Release continues at gesture velocity; pause or reverse before release springs back. Close animates first and React state catches up a frame later. Respect `prefers-reduced-motion`.

### Renderer and build

- TanStack Redact is the default browser renderer, with React Compiler. Application code keeps standard `react`/`react-dom` imports. Redact ships no Bun integration, so a Bun build plugin remaps those imports to `@tanstack/redact` subpaths and runs the React Compiler Babel step. Keep a build switch that produces a React DOM build from the same commit. The dev server defaults to React DOM for real Fast Refresh (Bun can't hot-accept Redact's aliased runtime modules); `RENDERER=redact turbo dev` uses Redact with full reloads. Check Redact behavior with a build before release.
- Redact renders synchronously. Before each release, compare both renderers on the same commit: time to usable content, and input latency while filtering the largest realistic list. Exercise forms, portals, Suspense navigation, `startTransition`, and `useDeferredValue`. Ship Redact only when cold entry improves and those interactions hold their baseline; otherwise ship React DOM.
- Budgets, Brotli, from the Bun build metafile: 150 kB cold-entry JS, 50 kB route-specific startup JS, 20 kB first-view CSS. CI fails above them. Reserve dimensions for images and make the LCP image discoverable early.
- Field targets: p75 LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, fully cached navigation to visible content ≤ 200 ms. Report before/after bytes and timings for performance changes.

### Hooks and review

- Lefthook pre-commit (`lefthook.yml`, installed by `bun install`) runs, in order on staged files: Biome format (re-staging fixes), Oxlint with `--deny-warnings`, and pinned React Doctor on changed `apps/web` lines with blocking errors only, telemetry and the network supply-chain scan off. CI repeats everything; hooks are a speed-up, not the gate. `LEFTHOOK=0` skips once.
- Use Playwright for cold entry, warm navigation, and typing while filtering a realistic large list.

## Agent skills

### Issue tracker

Track issues and specs as local Markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Decisions and their reasons are in `docs/adr/` (index: `docs/adr/README.md`); vocabulary is in `GLOSSARY.md`. Read the relevant ADR before changing a decision, and supersede it with a new ADR rather than silently diverging.

Use one shared `GLOSSARY.md` and `docs/adr/` at the repository root. See `docs/agents/domain.md`.
