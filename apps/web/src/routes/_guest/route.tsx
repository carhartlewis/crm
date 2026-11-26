import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeRedirect, sessionQuery } from "../../lib/session.ts";

/** `redirect` is optional, so links to guest pages needn't pass search params. */
interface GuestSearch {
  redirect?: string;
}

/**
 * Signed-out pages (sign-in) live under this pathless layout. A signed-in user goes back to
 * where they were heading, so signing in elsewhere moves this tab on too (see SessionWatcher).
 */
export const Route = createFileRoute("/_guest")({
  // Parsed by hand (no schema library in the cold-entry bundle for one param).
  validateSearch: (search: { redirect?: string | number | boolean | null }): GuestSearch => {
    const raw = search.redirect;
    const redirectTo = safeRedirect(raw === undefined || raw === null ? undefined : String(raw));

    return redirectTo ? { redirect: redirectTo } : {};
  },
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.fetchQuery(sessionQuery)) {
      throw redirect({ href: search.redirect ?? "/", replace: true });
    }
  },
});
