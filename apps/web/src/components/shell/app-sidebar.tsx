import edit from "@carbon/icons/es/edit/16.js";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarRail,
} from "@crm/ui/components/sidebar";
import { preloadable } from "@crm/ui/lib/preloadable";
import { Link, useRouterState } from "@tanstack/react-router";
import { Suspense } from "react";
import { prewarmChat } from "../../lib/chat-api.ts";
import { haptic } from "../../lib/haptics.ts";
import { isSettingsPath } from "../../lib/settings.ts";
import { shortcuts } from "../../lib/shortcuts.ts";
import { HotkeyTooltip } from "../hotkey-tooltip.tsx";
import { SettingsNav } from "../settings/settings-nav.tsx";
import { PinnedNav } from "./pinned-nav.tsx";
import { rubberBandScroll } from "./rubber-band.ts";
import { TitleBarControls } from "./title-bar.tsx";
import { WorkspaceMenu } from "./workspace-menu.tsx";

const EditIcon = carbonIcon(edit);

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });

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
        )}
      </SidebarContent>
      <SidebarFooter>
        <WorkspaceMenu userId={userId} />
      </SidebarFooter>
      <SidebarRail onHaptic={haptic} />
    </Sidebar>
  );
}
