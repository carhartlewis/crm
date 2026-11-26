import { SidebarMenu, SidebarMenuItem } from "@crm/ui/components/sidebar";
import { useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";
import { haptic } from "../../lib/haptics.ts";
import { pageById, pageForPath } from "../../lib/pages.ts";
import {
  moveItem,
  readPinnedOrder,
  usePinnedOrder,
  writePinnedOrder,
} from "../../lib/pinned-order.ts";
import { pinnedShortcut } from "../../lib/shortcuts.ts";
import { NavLink } from "./nav-link.tsx";
import { reorderable } from "./reorder.ts";

/** The pinned pages: drag to reorder (a haptic tick per slot), ⌥1–⌥9 to open. */
export function PinnedNav({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const order = usePinnedOrder(userId);

  const activeId = useRouterState({
    select: (state) => pageForPath(state.location.pathname)?.id,
  });

  const listRef = useCallback(
    (list: HTMLUListElement | null) =>
      reorderable({
        onSlotChange: haptic,
        onCommit: (from, to) =>
          writePinnedOrder(userId, moveItem(readPinnedOrder(userId), from, to)),
      })(list),
    [userId],
  );

  return (
    <SidebarMenu ref={listRef} aria-label="Pinned pages">
      {order.map((id, index) => (
        <SidebarMenuItem key={id} data-reorder-item>
          <NavLink
            page={pageById(id)}
            active={id === activeId}
            shortcut={pinnedShortcut(index)}
            userId={userId}
            workspaceId={workspaceId}
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
