import { SidebarMenu, SidebarMenuItem } from "@crm/ui/components/sidebar";
import { useCallback } from "react";
import { haptic } from "../../lib/haptics.ts";
import { useShownPathname } from "../../lib/shown-path.ts";
import { parsePinKey } from "@crm/core/chat";
import { isPageId, pageById, pageForPath } from "../../lib/pages.ts";
import {
  moveItem,
  readPinnedOrder,
  usePinnedOrder,
  writePinnedOrder,
} from "../../lib/pinned-order.ts";
import { pinnedShortcut } from "../../lib/shortcuts.ts";
import { NavLink } from "./nav-link.tsx";
import { reorderable } from "./reorder.ts";

/**
 * The pinned pages alone, from the device's copy of the order: the shell shows them until the
 * chat nav (pinned chats and spaces too) has loaded. Drag to reorder, ⌥1–⌥9 to open.
 */
export function PinnedNav({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  // Numbered as Pinned is: pages and chats; pinned spaces have their own group.
  const order = usePinnedOrder(userId).filter((key) => !key.startsWith("space:"));

  const activeId = pageForPath(useShownPathname())?.id;

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
      {order.map((key, index) => {
        const pin = parsePinKey(key);

        // Pinned chats and spaces need synced titles: the chat nav shows them once it loads.
        if (pin?.kind !== "page" || !isPageId(pin.id)) return null;

        return (
          <SidebarMenuItem key={key} data-reorder-item>
            <NavLink
              page={pageById(pin.id)}
              active={pin.id === activeId}
              shortcut={pinnedShortcut(index)}
              userId={userId}
              workspaceId={workspaceId}
            />
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
