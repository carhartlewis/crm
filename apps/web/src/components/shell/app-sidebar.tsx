import home from "@carbon/icons/es/home/16.js";
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
import { Link, useRouterState } from "@tanstack/react-router";
import { haptic } from "../../lib/haptics.ts";
import { isSettingsPath } from "../../lib/settings.ts";
import { SettingsNav } from "../settings/settings-nav.tsx";
import { ariaKeyShortcuts, shortcuts } from "../../lib/shortcuts.ts";
import { PinnedNav } from "./pinned-nav.tsx";
import { RowShortcut } from "./row-shortcut.tsx";
import { rubberBandScroll } from "./rubber-band.ts";
import { TitleBarControls } from "./title-bar.tsx";
import { WorkspaceMenu } from "./workspace-menu.tsx";

const HomeIcon = carbonIcon(home);

export interface AppSidebarProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly onSearch: () => void;
  readonly onSearchIntent: () => void;
}

export function AppSidebar({ userId, workspaceId, onSearch, onSearchIntent }: AppSidebarProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onHome = pathname === "/";

  return (
    <Sidebar variant="inset">
      {/* Its row is centered 40px from the window top: the traffic lights' and page title's line. */}
      <SidebarHeader className="app-region-drag">
        <div className="mt-2.5 flex h-7 items-center justify-end">
          <TitleBarControls onSearch={onSearch} onSearchIntent={onSearchIntent} />
        </div>
      </SidebarHeader>
      <SidebarContent ref={rubberBandScroll} className="overscroll-none">
        {isSettingsPath(pathname) ? (
          <SettingsNav />
        ) : (
          <div>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={onHome}
                    aria-keyshortcuts={ariaKeyShortcuts(shortcuts.home)}
                    render={<Link to="/" />}
                  >
                    <HomeIcon />
                    <span>Home</span>
                    <RowShortcut shortcut={shortcuts.home} />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Pinned</SidebarGroupLabel>
              <PinnedNav userId={userId} workspaceId={workspaceId} />
            </SidebarGroup>
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        <WorkspaceMenu userId={userId} />
      </SidebarFooter>
      <SidebarRail onHaptic={haptic} />
    </Sidebar>
  );
}
