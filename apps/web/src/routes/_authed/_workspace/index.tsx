import { createFileRoute } from "@tanstack/react-router";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";

  if (hour < 18) return "Good afternoon";

  return "Good evening";
}

/** Home. The component (cards, shortcuts) is in index.lazy.tsx. */
export const Route = createFileRoute("/_authed/_workspace/")({
  // The clock is read once per visit, not on every render.
  loader: () => ({ greeting: greeting(new Date().getHours()) }),
});
