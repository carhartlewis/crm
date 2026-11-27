/**
 * Chat, space and sidebar rules shared by the API (writes) and the web app (forms, the sidebar).
 * Client-safe. See ADR 0018.
 */

import { Option, Schema } from "effect";
import { ID_PREFIXES, isId } from "../ids/index.ts";

export const CHAT_TITLE_MAX = 120;
export const SPACE_NAME_MAX = 60;
export const FOLDER_NAME_MAX = 60;
export const SPACE_DESCRIPTION_MAX = 280;

/** The longest title made from a first message, before the ellipsis. */
const DERIVED_TITLE_MAX = 60;

/** The palette a space can use; each name maps to a token in the web app. */
export const SPACE_COLORS = ["blue", "orange", "green", "purple", "pink", "gray"] as const;

export type SpaceColor = (typeof SPACE_COLORS)[number];

export function isSpaceColor(value: string): value is SpaceColor {
  return SPACE_COLORS.some((color) => color === value);
}

export type NameResult = { ok: true; value: string } | { ok: false; message: string };

function normalizeName(input: string, max: number, empty: string): NameResult {
  const value = input.trim().replaceAll(/\s+/g, " ");

  if (!value) return { ok: false, message: empty };

  if (value.length > max) return { ok: false, message: `Keep it under ${max} characters` };

  return { ok: true, value };
}

export const normalizeChatTitle = (input: string) =>
  normalizeName(input, CHAT_TITLE_MAX, "Enter a title");

export const normalizeSpaceName = (input: string) =>
  normalizeName(input, SPACE_NAME_MAX, "Enter a name");

export const normalizeFolderName = (input: string) =>
  normalizeName(input, FOLDER_NAME_MAX, "Enter a name");

/** A space's description: trimmed, may be empty, at most 280 characters. */
export function normalizeSpaceDescription(input: string): NameResult {
  const value = input.trim().replaceAll(/\s+/g, " ");

  if (value.length > SPACE_DESCRIPTION_MAX) {
    return { ok: false, message: `Keep it under ${SPACE_DESCRIPTION_MAX} characters` };
  }

  return { ok: true, value };
}

export function spaceDescriptionError(value: string) {
  const result = normalizeSpaceDescription(value);

  return result.ok ? undefined : result.message;
}

/** A chat's first title: the first line of the first message, cut at a word near 60 characters. */
export function titleFromMessage(message: string) {
  const line = message.trim().split("\n")[0]?.replaceAll(/\s+/g, " ") ?? "";

  if (!line) return "New chat";

  if (line.length <= DERIVED_TITLE_MAX) return line;

  const cut = line.slice(0, DERIVED_TITLE_MAX);
  const space = cut.lastIndexOf(" ");

  return `${(space > DERIVED_TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const isChatId = (value: string) => isId(ID_PREFIXES.chat, value);
export const isSpaceId = (value: string) => isId(ID_PREFIXES.chat_space, value);
export const isSidebarId = (value: string) => isId(ID_PREFIXES.sidebar, value);

/** Folders are not rows, but their ids use the same scheme so they never collide. */
export const isFolderId = (value: string) => isId(ID_PREFIXES.folder, value);

/** What the Pinned group can hold. */
export type PinKind = "page" | "space" | "chat";

export type PinKey = `${PinKind}:${string}`;

export function pinKey(kind: PinKind, id: string): PinKey {
  return `${kind}:${id}`;
}

export function parsePinKey(key: string): { kind: PinKind; id: string } | undefined {
  const [kind, id] = key.split(":", 2);

  if (!id || (kind !== "page" && kind !== "space" && kind !== "chat")) return undefined;

  if (kind === "space" && !isSpaceId(id)) return undefined;

  if (kind === "chat" && !isChatId(id)) return undefined;

  if (kind === "page" && !/^[a-z][a-z-]{0,39}$/.test(id)) return undefined;

  return { kind, id };
}

export interface Folder {
  readonly id: string;
  readonly name: string;
  readonly chatIds: readonly string[];
}

export interface SidebarLayout {
  readonly pinned: readonly PinKey[];
  readonly folders: readonly Folder[];
}

export const EMPTY_LAYOUT: SidebarLayout = { pinned: [], folders: [] };

export const MAX_PINNED = 100;
export const MAX_FOLDERS = 50;
export const MAX_FOLDER_CHATS = 500;

/** A folder as stored in the `sidebar` row and sent to `PUT /api/sidebar`, before the rules. */
export const FolderInput = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  chatIds: Schema.Array(Schema.String),
});

export type FolderInput = typeof FolderInput.Type;

/** The row's JSON columns, decoded at the boundary (the shape stream, the request body). */
export const StoredPinned = Schema.Array(Schema.String);
export const StoredFolders = Schema.Array(FolderInput);

const decodePinned = Schema.decodeUnknownOption(StoredPinned);
const decodeFolders = Schema.decodeUnknownOption(StoredFolders);

/** A synced row's JSON columns; anything malformed reads as empty. */
export function decodeStoredLayout(row: { readonly pinned: Json; readonly folders: Json }) {
  return parseSidebarLayout(
    Option.getOrElse(decodePinned(row.pinned), () => []),
    Option.getOrElse(decodeFolders(row.folders), () => []),
  );
}

/** JSON as it arrives from a jsonb column. */
export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

/**
 * The sidebar layout the rules allow. Unknown pins, bad ids and duplicates are dropped, and a
 * chat sits in at most one folder (the first that lists it), so a stale or edited row never
 * breaks the sidebar.
 */
export function parseSidebarLayout(
  pinned: readonly string[],
  folders: readonly FolderInput[],
): SidebarLayout {
  const pins: PinKey[] = [];

  for (const key of new Set(pinned)) {
    const pin = parsePinKey(key);

    if (pin && pins.length < MAX_PINNED) pins.push(pinKey(pin.kind, pin.id));
  }

  const seenFolders = new Set<string>();
  const seenChats = new Set<string>();
  const parsedFolders: Folder[] = [];

  for (const folder of folders.slice(0, MAX_FOLDERS)) {
    const name = normalizeFolderName(folder.name);

    if (!isFolderId(folder.id) || seenFolders.has(folder.id) || !name.ok) continue;

    seenFolders.add(folder.id);

    const chatIds: string[] = [];

    for (const chatId of folder.chatIds) {
      if (chatIds.length >= MAX_FOLDER_CHATS) break;

      if (!isChatId(chatId) || seenChats.has(chatId)) continue;

      seenChats.add(chatId);
      chatIds.push(chatId);
    }

    parsedFolders.push({ id: folder.id, name: name.value, chatIds });
  }

  return { pinned: pins, folders: parsedFolders };
}

/** Field validators for forms: the error message, or `undefined` when the value is valid. */
export function chatTitleError(value: string) {
  const result = normalizeChatTitle(value);

  return result.ok ? undefined : result.message;
}

export function spaceNameError(value: string) {
  const result = normalizeSpaceName(value);

  return result.ok ? undefined : result.message;
}

export function folderNameError(value: string) {
  const result = normalizeFolderName(value);

  return result.ok ? undefined : result.message;
}

/**
 * How much the agent may do in a chat without asking (ADR 0019), as in comp-neo: `manual` asks
 * before every change, `auto` asks only before risky calls, `bypass` runs everything and marks
 * risky calls. Reads always run.
 */
export const PERMISSION_MODES = ["manual", "auto", "bypass"] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const DEFAULT_PERMISSION_MODE: PermissionMode = "manual";

export function isPermissionMode(value: string): value is PermissionMode {
  return PERMISSION_MODES.some((mode) => mode === value);
}

/** What one tool call does, as far as the CRM can tell before it runs. */
export type CallKind = "read" | "change" | "risky";

/** A tool's MCP annotations: hints from its server, not promises. */
export interface CallHints {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
}

/**
 * Names that read or change secrets, credentials, raw data, code or money. A call to one is
 * risky whatever its annotations say. Words are separated by `_` or `-`.
 */
const SENSITIVE_NAME =
  /(?:^|[_-])(?:execute|exec|run[_-]sql|sql|query|queries|logs?|secrets?|keys?|tokens?|credentials?|passwords?|env|invoices?|payments?|billing|buy|purchase|ssh)(?:[_-]|$)/i;

/** Names that change something: such a tool that says it only reads is not believed. */
const CHANGING_NAME =
  /(?:^|[_-])(?:create|update|save|delete|remove|deploy|apply|merge|reset|set|patch|put|post|edit|start|stop|restart|rotate|revoke|enable|disable|invite|grant|add|drop|insert|write|send|submit|cancel|archive|move|transfer|approve|assign|forget|remember)(?:[_-]|$)/i;

/**
 * The kind of a call from its bare tool name and its annotations. A tool that doesn't say it only
 * reads is risky unless it says it isn't destructive, as MCP defines.
 */
export function callKind(toolName: string, hints: CallHints | undefined): CallKind {
  if (SENSITIVE_NAME.test(toolName)) return "risky";

  if (hints?.readOnlyHint === true) return CHANGING_NAME.test(toolName) ? "risky" : "read";

  if (hints?.readOnlyHint === false && hints.destructiveHint === false) return "change";

  return "risky";
}

/** What happens to a call: it runs, it waits for the person, or it runs marked as risky. */
export type CallDecision = "run" | "ask" | "run_flagged";

export function callDecision(mode: PermissionMode, kind: CallKind): CallDecision {
  if (kind === "read") return "run";

  if (kind === "risky") return mode === "bypass" ? "run_flagged" : "ask";

  return mode === "manual" ? "ask" : "run";
}
