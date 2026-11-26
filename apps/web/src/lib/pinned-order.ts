import { useSyncExternalStore } from "react";
import { isPageId, pages, type PageId } from "./pages.ts";

/**
 * The order of the pinned sidebar pages, per user. It lives in localStorage (a per-device
 * preference) and is read through `useSyncExternalStore`, so other tabs follow along.
 */
const DEFAULT_ORDER: readonly PageId[] = pages.map((page) => page.id);
const storageKey = (userId: string) => `crm:pinned:${userId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; order: readonly PageId[] }>();

/** The stored JSON as a list of strings; anything else (missing, corrupt, edited) is empty. */
export function parseStoredOrder(raw: string | null): readonly string[] {
  try {
    const value: unknown = raw === null ? [] : JSON.parse(raw);

    return Array.isArray(value)
      ? value.filter((item): item is string => String(item) === item)
      : [];
  } catch {
    return [];
  }
}

/** Known ids in the saved order, then any page added since, so nothing is lost or duplicated. */
export function normalizeOrder(saved: readonly string[]): readonly PageId[] {
  const unique = [...new Set(saved.filter(isPageId))];

  return [...unique, ...DEFAULT_ORDER.filter((id) => !unique.includes(id))];
}

/** Moves the item at `from` to `to`, shifting the items between. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);

  if (item !== undefined) next.splice(to, 0, item);

  return next;
}

function readRaw(userId: string) {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function readPinnedOrder(userId: string): readonly PageId[] {
  const raw = readRaw(userId);
  const cached = cache.get(userId);

  // Same snapshot for the same stored value: useSyncExternalStore compares by identity.
  if (cached?.raw === raw) return cached.order;

  const order = normalizeOrder(parseStoredOrder(raw));

  cache.set(userId, { raw, order });

  return order;
}

export function writePinnedOrder(userId: string, order: readonly PageId[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(order));
  } catch {
    // Storage is full or blocked: the order lasts until reload.
    cache.set(userId, { raw: readRaw(userId), order });
  }

  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePinnedOrder(userId: string) {
  return useSyncExternalStore(
    subscribe,
    () => readPinnedOrder(userId),
    () => DEFAULT_ORDER,
  );
}
