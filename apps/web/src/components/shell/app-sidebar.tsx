import edit from "@carbon/icons/es/edit/16.js";
import grid from "@carbon/icons/es/grid/16.js";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@crm/ui/components/sidebar";
import { preloadable } from "@crm/ui/lib/preloadable";
import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { prewarmChat } from "../../lib/chat-api.ts";
import { usePinnedOrder } from "../../lib/pinned-order.ts";
import { haptic } from "../../lib/haptics.ts";
import { useShownPathname } from "../../lib/shown-path.ts";
import { isSettingsPath } from "../../lib/settings.ts";
import { shortcuts } from "../../lib/shortcuts.ts";
import { HotkeyTooltip } from "../hotkey-tooltip.tsx";
import { SettingsNav } from "../settings/settings-nav.tsx";
import { PinnedNav } from "./pinned-nav.tsx";
import { rubberBandScroll } from "./rubber-band.ts";
import { TitleBarControls } from "./title-bar.tsx";
import { WorkspaceMenu } from "./workspace-menu.tsx";

const EditIcon = carbonIcon(edit);
const SpacesIcon = carbonIcon(grid);

// Pinned chats and spaces, Spaces, Folders and Recents read synced data: their own chunk. It is
// the sidebar's main content, so it starts loading with the shell, not on idle.
const ChatNav = preloadable(() => import("./chat-nav.tsx"));

void ChatNav.preload();

export interface AppSidebarProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly onSearch: () => void;
  readonly onSearchIntent: () => void;
}

export function AppSidebar({ userId, workspaceId, onSearch, onSearchIntent }: AppSidebarProps) {
  const pathname = useShownPathname();
  const pinned = usePinnedOrder(userId);

  // One highlighted row: a pinned space highlights itself; any other space highlights Spaces.
  const openSpace = pathname.startsWith("/spaces/") ? pathname.slice("/spaces/".length) : null;

  const spacesActive =
    pathname === "/spaces" || (openSpace !== null && !pinned.includes(`space:${openSpace}`));

  return (
    <Sidebar variant="inset">
      {/* Its row is centered 40px from the window top: the traffic lights' and page title's line. */}
      <SidebarHeader className="app-region-drag">
        <div className="mt-2.5 flex h-7 items-center justify-end">
          <TitleBarControls onSearch={onSearch} onSearchIntent={onSearchIntent} />
        </div>
        <HotkeyTooltip shortcut={shortcuts.newChat} side="right">
          <Button
            variant="outline"
            className="app-region-no-drag w-full"
            // A session is made ready while the pointer travels; the first answer comes sooner.
            onPointerEnter={() => prewarmChat()}
            onFocus={() => prewarmChat()}
            render={<Link to="/" />}
          >
            <EditIcon />
            New chat
          </Button>
        </HotkeyTooltip>
      </SidebarHeader>
      <SidebarContent ref={rubberBandScroll} className="overscroll-none">
        {isSettingsPath(pathname) ? (
          <SettingsNav />
        ) : (
          <>
            {/* As in Glass: Spaces is a page; the sidebar keeps what you pinned and your chats. */}
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={spacesActive} render={<Link to="/spaces" />}>
                    <SpacesIcon />
                    <span>Spaces</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <Suspense
              fallback={
                <SidebarGroup>
                  <SidebarGroupLabel>Pinned</SidebarGroupLabel>
                  <PinnedNav userId={userId} workspaceId={workspaceId} />
                </SidebarGroup>
              }
            >
              <ChatNav key={workspaceId} userId={userId} workspaceId={workspaceId} />
            </Suspense>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <WorkspaceMenu userId={userId} />
      </SidebarFooter>
      <SidebarRail onHaptic={haptic} />
    </Sidebar>
  );
}
