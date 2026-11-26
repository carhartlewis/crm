import * as React from "react";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";

type Theme = "dark" | "light" | "system";

type ResolvedTheme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES: ReadonlySet<string> = new Set(["dark", "light", "system"]);

const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined);

function isTheme(value: string | null): value is Theme {
  return value !== null && THEME_VALUES.has(value);
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light";
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");

  style.append(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.append(style);

  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function applyResolved(resolved: ResolvedTheme, disableTransitions: boolean) {
  const root = document.documentElement;
  const restore = disableTransitions ? disableTransitionsTemporarily() : null;

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  restore?.();
}

/**
 * The theme lives outside React: localStorage, the OS color scheme, and other tabs are the
 * sources of truth. React reads it with useSyncExternalStore; the store applies it to <html>
 * when it changes, so no effect is needed.
 */
function createThemeStore(storageKey: string, defaultTheme: Theme, disableTransitions: boolean) {
  const read = (): Theme => {
    const stored = localStorage.getItem(storageKey);

    return isTheme(stored) ? stored : defaultTheme;
  };

  const apply = () => {
    const theme = read();

    applyResolved(theme === "system" ? getSystemTheme() : theme, disableTransitions);
  };

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const onSystemChange = () => {
    if (read() !== "system") return;

    apply();
    notify();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage || event.key !== storageKey) return;

    apply();
    notify();
  };

  return {
    get: read,
    set(theme: Theme) {
      localStorage.setItem(storageKey, theme);
      apply();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      if (listeners.size === 1) {
        apply(); // first subscriber (the provider mounting): make <html> match the stored theme
        window.matchMedia(COLOR_SCHEME_QUERY).addEventListener("change", onSystemChange);
        window.addEventListener("storage", onStorage);
      }

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          window.matchMedia(COLOR_SCHEME_QUERY).removeEventListener("change", onSystemChange);
          window.removeEventListener("storage", onStorage);
        }
      };
    },
  };
}

type ThemeStore = ReturnType<typeof createThemeStore>;

const stores = new Map<string, ThemeStore>();

function themeStore(storageKey: string, defaultTheme: Theme, disableTransitions: boolean) {
  const key = `${storageKey}|${defaultTheme}|${disableTransitions}`;
  const existing = stores.get(key);

  if (existing) return existing;

  const store = createThemeStore(storageKey, defaultTheme, disableTransitions);

  stores.set(key, store);

  return store;
}

/**
 * Applies the stored or system theme to <html> synchronously. Call before the first render so a
 * dark-mode launch never paints a light frame.
 */
export function applyInitialTheme(storageKey = "theme", defaultTheme: Theme = "system") {
  const stored = localStorage.getItem(storageKey);
  const theme = isTheme(stored) ? stored : defaultTheme;

  applyResolved(theme === "system" ? getSystemTheme() : theme, false);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const store = themeStore(storageKey, defaultTheme, disableTransitionOnChange);
  const theme = React.useSyncExternalStore(store.subscribe, store.get, () => defaultTheme);

  // "d" toggles light/dark outside text fields. A window listener is an external subscription.
  useMountEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

      if (isEditableTarget(event.target) || event.key.toLowerCase() !== "d") return;

      const current = store.get();
      const resolved = current === "system" ? getSystemTheme() : current;

      store.set(resolved === "dark" ? "light" : "dark");
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const value = React.useMemo(() => ({ theme, setTheme: store.set }), [theme, store]);

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
