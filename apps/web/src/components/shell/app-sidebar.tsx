import chevronLeft from "@carbon/icons/es/chevron--left/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import home from "@carbon/icons/es/home/16.js";
import search from "@carbon/icons/es/search/16.js";
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
} from "@crm/ui/components/sidebar";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { PinnedNav } from "./pinned-nav.tsx";
import { rubberBandScroll } from "./rubber-band.ts";
import { trafficLights } from "./sidebar-toggle.tsx";
import { WorkspaceMenu } from "./workspace-menu.tsx";

const ChevronLeftIcon = carbonIcon(chevronLeft);
const ChevronRightIcon = carbonIcon(chevronRight);
const HomeIcon = carbonIcon(home);
const SearchIcon = carbonIcon(search);

export interface AppSidebarProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly onSearch: () => void;
  readonly onSearchIntent: () => void;
}

export function AppSidebar({ userId, workspaceId, onSearch, onSearchIntent }: AppSidebarProps) {
  const router = useRouter();
  const onHome = useRouterState({ select: (state) => state.location.pathname === "/" });

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="app-region-drag">
        <div
          data-traffic-lights={trafficLights || undefined}
          className="flex h-7 items-center gap-1 data-traffic-lights:pl-18"
        >
          <div className="app-region-no-drag ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Search"
              onClick={onSearch}
              onPointerEnter={onSearchIntent}
            >
              <SearchIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back"
              onClick={() => router.history.back()}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Forward"
              onClick={() => router.history.forward()}
            >
              <ChevronRightIcon />
            </Button>
          </div>
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
