import { useSyncExternalStore } from "react";

/** The sidebar's sections, each opened and closed from its label. */
export type SidebarSection = "pinned" | "spaces" | "pinned-chats" | "folders" | "recents";

/**
 * Which sections a person closed, on this device: a view preference like the sidebar's own open
 * state, not CRM data, so it is not synced. Read with `useSyncExternalStore`, so every section
 * (and the shell's first paint) agrees without effects.
 */
const storageKey = (userId: string) => `crm:sidebar-sections:${userId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, string>();

function read(userId: string) {
  try {
    return localStorage.getItem(storageKey(userId)) ?? "";
  } catch {
    return cache.get(userId) ?? "";
  }
}

const closedIn = (stored: string) => new Set(stored.split(",").filter(Boolean));

function subscribe(listener: () => void) {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("crm:sidebar-sections:")) listener();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setSectionOpen(userId: string, section: SidebarSection, open: boolean) {
  const closed = closedIn(read(userId));

  if (open) closed.delete(section);
  else closed.add(section);

  const next = [...closed].join(",");

  cache.set(userId, next);

  try {
    localStorage.setItem(storageKey(userId), next);
  } catch {
    // Storage is blocked: the choice lasts until reload.
  }

  for (const listener of listeners) listener();
}

/** Whether a section is open (the default) for this person on this device. */
export function useSectionOpen(userId: string, section: SidebarSection) {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(userId),
    () => "",
  );

  return !closedIn(stored).has(section);
}
