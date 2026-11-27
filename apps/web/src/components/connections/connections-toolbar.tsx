import type { ReactNode } from "react";

/** The Connections page's controls: what to show and whose (`tabs`), and its `?q=` search. */
export type ConnectionsToolbarParts = { tabs: ReactNode; search: ReactNode };

/** Tabs on the left, search on the right, matching a data table's toolbar line. */
export function ConnectionsToolbar({ tabs, search }: ConnectionsToolbarParts) {
  return (
    <div className="@container flex flex-wrap items-center gap-3">
      {tabs}
      <div className="hidden @2xl:ml-auto @2xl:block">{search}</div>
    </div>
  );
}
