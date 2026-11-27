import arrowLeft from "@carbon/icons/es/arrow--left/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@crm/ui/components/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { settingsGroups } from "../../lib/settings.ts";

const BackIcon = carbonIcon(arrowLeft);

/** The sidebar while you're in settings: the way back, then each group's pages. */
export function SettingsNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <BackIcon />
              <span>Back to app</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      {settingsGroups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.pages.map((page) => {
              const Icon = page.icon;

              return (
                <SidebarMenuItem key={page.to}>
                  <SidebarMenuButton isActive={pathname === page.to} render={<Link to={page.to} />}>
                    <Icon />
                    <span>{page.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
