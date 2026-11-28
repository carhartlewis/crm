import { DEFAULT_PERMISSION_MODE, isPermissionMode, type PermissionMode } from "@crm/core/chat";

/** What each mode means, as the mode menu shows it (ADR 0019). */
export const PERMISSION_MODE_OPTIONS: readonly {
  readonly value: PermissionMode;
  readonly label: string;
  readonly description: string;
}[] = [
  { value: "plan", label: "Plan", description: "Research and propose a plan; change nothing" },
  { value: "manual", label: "Manual", description: "Always ask before making changes" },
  { value: "auto", label: "Auto", description: "Ask only before risky actions" },
  {
    value: "bypass",
    label: "Bypass permissions",
    description: "Run everything and flag risky actions",
  },
];

export function permissionModeLabel(mode: string) {
  return PERMISSION_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Manual";
}

/** The mode a new chat starts in, before any chat has synced: the last pick on this device. */
const storageKey = (userId: string) => `crm:permission-mode:${userId}`;

/** A synced chat row, as far as its mode goes. */
interface ModeRow {
  readonly permission_mode: string;
  readonly updated_at: string;
}

/**
 * The mode a new chat starts in (ADR 0033): the person's mode, which every chat they see shares
 * except chats in Plan. Read from the synced chats, the newest change first, so every device
 * agrees; the last pick on this device stands in until a chat has synced.
 */
export function lastPermissionMode(userId: string, chats: readonly ModeRow[] = []): PermissionMode {
  const synced = chats
    .filter((chat) => chat.permission_mode !== "plan" && isPermissionMode(chat.permission_mode))
    .reduce<ModeRow | null>(
      (newest, chat) => (newest && newest.updated_at >= chat.updated_at ? newest : chat),
      null,
    )?.permission_mode;

  if (synced && isPermissionMode(synced)) return synced;

  try {
    const stored = localStorage.getItem(storageKey(userId)) ?? "";

    return isPermissionMode(stored) ? stored : DEFAULT_PERMISSION_MODE;
  } catch {
    return DEFAULT_PERMISSION_MODE;
  }
}

/** The mode a plan runs in, and the mode a new chat starts in instead of Plan. */
export const RUN_PLAN_MODE: PermissionMode = "auto";

export function rememberPermissionMode(userId: string, mode: PermissionMode) {
  // Plan is for one task at a time: the next new chat starts ready to work.
  if (mode === "plan") return;

  try {
    localStorage.setItem(storageKey(userId), mode);
  } catch {
    // Storage is blocked: new chats start in the default mode.
  }
}
