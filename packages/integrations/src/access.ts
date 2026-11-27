/**
 * What a connection lets the agent do. The user picks one level per connection; nothing is
 * configured per app. OAuth always asks for every scope the server offers (see `oauth.ts`), and
 * the level is applied to the tools the server publishes:
 *
 * - `read`: only tools the server marks read-only (MCP `readOnlyHint: true`).
 * - `write`: every tool.
 *
 * A tool without annotations counts as a write, so a server that declares nothing exposes no
 * tools at `read`. Annotations are the server's own claim; they are trusted as far as the
 * server is.
 */
export const accessLevels = ["read", "write"] as const;

export type Access = (typeof accessLevels)[number];

export function isAccess(value: unknown): value is Access {
  return value === "read" || value === "write";
}

export interface ToolHints {
  readonly readOnlyHint?: boolean;
}

export function isReadOnly(annotations: ToolHints | undefined) {
  return annotations?.readOnlyHint === true;
}

export function allowsTool(access: Access, annotations: ToolHints | undefined) {
  return access === "write" || isReadOnly(annotations);
}
