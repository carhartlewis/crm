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
} from "@crm/ui/components/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { PinnedNav } from "./pinned-nav.tsx";
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
  const onHome = useRouterState({ select: (state) => state.location.pathname === "/" });

  return (
    <Sidebar variant="inset">
      {/* Centered on the same line as the traffic lights and the page's title bar. */}
      <SidebarHeader className="app-region-drag">
        <div className="flex h-7 items-center justify-end">
          <TitleBarControls onSearch={onSearch} onSearchIntent={onSearchIntent} />
        </div>
      </SidebarHeader>
      <SidebarContent ref={rubberBandScroll} className="overscroll-none">
        <div>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={onHome} render={<Link to="/" />}>
                  <HomeIcon />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Pinned</SidebarGroupLabel>
            <PinnedNav userId={userId} workspaceId={workspaceId} />
          </SidebarGroup>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <WorkspaceMenu userId={userId} />
      </SidebarFooter>
    </Sidebar>
  );
}
