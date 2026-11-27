import { parsePinKey, type PinKey, pinKey } from "@crm/core/chat";
import { useSyncExternalStore } from "react";
import { isPageId, pages } from "./pages.ts";

/**
 * The order of the Pinned sidebar group, per user: pages, spaces and chats (ADR 0018). The
 * synced `sidebar` row is the source; this localStorage copy lets the shell and ⌥1–⌥9 read the
 * order synchronously, before the chats chunk loads. Read through `useSyncExternalStore`, so
 * other tabs follow along.
 */
const DEFAULT_ORDER: readonly PinKey[] = pages.map((page) => pinKey("page", page.id));
const storageKey = (userId: string) => `crm:pinned:${userId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; order: readonly PinKey[] }>();

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

/** A stored entry as a pin key; bare page ids are the format from before chats. */
function toPinKey(entry: string): PinKey | undefined {
  if (isPageId(entry)) return pinKey("page", entry);

  const pin = parsePinKey(entry);

  if (!pin || (pin.kind === "page" && !isPageId(pin.id))) return undefined;

  return pinKey(pin.kind, pin.id);
}

/**
 * Known keys in the saved order, then any page added since, so nothing is lost or duplicated.
 * Pages are always pinned; spaces and chats only when the user pinned them.
 */
export function normalizeOrder(saved: readonly string[]): readonly PinKey[] {
  const keys = new Set<PinKey>();

  for (const entry of saved) {
    const key = toPinKey(entry);

    if (key) keys.add(key);
  }

  return [...keys, ...DEFAULT_ORDER.filter((key) => !keys.has(key))];
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

export function readPinnedOrder(userId: string): readonly PinKey[] {
  const raw = readRaw(userId);
  const cached = cache.get(userId);

  // Same snapshot for the same stored value: useSyncExternalStore compares by identity.
  if (cached?.raw === raw) return cached.order;

  const order = normalizeOrder(parseStoredOrder(raw));

  cache.set(userId, { raw, order });

  return order;
}

/** Whether the device has an order saved from before the synced row existed. */
export function hasStoredOrder(userId: string) {
  return readRaw(userId) !== null;
}

export function writePinnedOrder(userId: string, order: readonly PinKey[]) {
  const raw = JSON.stringify(order);

  // Writing the same order again (each sync of the row) must not wake every subscriber.
  if (readRaw(userId) === raw) return;

  try {
    localStorage.setItem(storageKey(userId), raw);
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
