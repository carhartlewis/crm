import { createElement, use, type ComponentType } from "react";

/**
 * A code-split component that can be warmed before it renders. `React.lazy` suspends for a
 * scheduler tick (often ~300 ms of fallback) even when the chunk is already downloaded; this
 * renders synchronously once `preload()` has resolved, and suspends only if it hasn't.
 *
 *   const Settings = preloadable(() => import("./settings.tsx"));
 *   <button onPointerEnter={Settings.preload}>Settings</button>
 */
export function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let Loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;

  const preload = () =>
    (pending ??= load().then((module) => {
      Loaded = module.default;

      return Loaded;
    }));

  function Preloadable(props: P) {
    return createElement(Loaded ?? use(preload()), props);
  }

  return Object.assign(Preloadable, { preload });
}
