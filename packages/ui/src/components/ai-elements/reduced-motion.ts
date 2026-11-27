import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

/** Whether the viewer asks for reduced motion, read from the browser and kept live. */
export function prefersReducedMotion() {
  return window.matchMedia(QUERY).matches;
}

/** `prefersReducedMotion()` as React state, so a change re-renders the caller. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
