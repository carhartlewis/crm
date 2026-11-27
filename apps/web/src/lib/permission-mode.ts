import { DEFAULT_PERMISSION_MODE, isPermissionMode, type PermissionMode } from "@crm/core/chat";

/** What each mode means, as the mode menu shows it (ADR 0019). */
export const PERMISSION_MODE_OPTIONS: readonly {
  readonly value: PermissionMode;
  readonly label: string;
  readonly description: string;
}[] = [
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

/** The mode a new chat starts in: the one this person picked last, on this device. */
const storageKey = (userId: string) => `crm:permission-mode:${userId}`;

export function lastPermissionMode(userId: string): PermissionMode {
  try {
    const stored = localStorage.getItem(storageKey(userId)) ?? "";

    return isPermissionMode(stored) ? stored : DEFAULT_PERMISSION_MODE;
  } catch {
    return DEFAULT_PERMISSION_MODE;
  }
}

export function rememberPermissionMode(userId: string, mode: PermissionMode) {
  try {
    localStorage.setItem(storageKey(userId), mode);
  } catch {
    // Storage is blocked: new chats start in the default mode.
  }
}
