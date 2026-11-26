import { isString } from "@crm/ui/lib/guards";

export function resolveHiddenColumns({
  fromUrl,
  stored,
  defaults,
}: {
  fromUrl: string[] | null;
  stored: string[] | null;
  defaults: string[];
}): string[] {
  return fromUrl ?? stored ?? defaults;
}

export function parseStoredColumns(raw: string | null): string[] | null {
  if (raw === null) return null;

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(value)) return null;

  return value.every(isString) ? value : null;
}

const STORAGE_PREFIX = "crm:table-columns:";

const listeners = new Set<() => void>();

export function readStoredColumns(key: string): string | null {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

export function writeStoredColumns(key: string, hidden: string[]): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(hidden));
  } catch {}

  for (const listener of listeners) listener();
}

export function subscribeStoredColumns(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
