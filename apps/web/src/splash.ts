import type { AnyRouter } from "@tanstack/react-router";

const FADE_MS = 200;

/**
 * Crossfades the launch splash (static HTML in index.html) into the app once the router has
 * resolved and rendered the first route, whichever it reports first: the guards have run,
 * redirects have settled, and the route's chunk and critical data are in.
 */
export function dismissSplash(router: AnyRouter) {
  const splash = document.getElementById("splash");

  if (!splash) return;

  let dismissed = false;

  const dismiss = () => {
    if (dismissed) return;

    dismissed = true;

    for (const unsubscribe of unsubscribes) unsubscribe();

    // One frame later, so the first route is on screen beneath it before the fade starts.
    requestAnimationFrame(() => {
      splash.dataset["done"] = "";
      setTimeout(() => splash.remove(), FADE_MS);
    });
  };

  const unsubscribes = [
    router.subscribe("onResolved", dismiss),
    router.subscribe("onRendered", dismiss),
  ];
}
