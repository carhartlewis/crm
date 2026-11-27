import { useRouterState } from "@tanstack/react-router";

/**
 * The path of the page on screen. While a navigation loads, the router's `location` is already
 * the next page; highlights follow what is shown, so a click doesn't light up a row before its
 * page appears.
 */
export function useShownPathname() {
  return useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
}
