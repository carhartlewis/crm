import { useSidebar } from "@crm/ui/components/sidebar";
import { PageShellHeader } from "@crm/ui/patterns/page-shell";
import { createContext, type ReactNode, use } from "react";
import { SidebarToggle, trafficLights } from "./sidebar-toggle.tsx";
import { TitleBarControls, type TitleBarControlsProps } from "./title-bar.tsx";

/** The shell's title-bar actions (⌘K search), for page headers to render. */
export const TitleBarContext = createContext<TitleBarControlsProps>({
  onSearch: () => undefined,
  onSearchIntent: () => undefined,
});

/**
 * A workspace page's header: the vms.dev page title row, which is also the window's title bar
 * (a drag area). When the sidebar is hidden, the sidebar toggle, search, back and forward lead it
 * on the title's line, and on macOS they clear the traffic lights. The toggle then sits at the
 * same x as in the sidebar's top row (inset 8px + padding 32px + 40px = sidebar 16px + 64px).
 */
export function WorkspacePageHeader({ children }: { children: ReactNode }) {
  const { state, isMobile } = useSidebar();
  const controls = use(TitleBarContext);
  const hidden = state === "collapsed" || isMobile;

  return (
    <PageShellHeader
      className="app-region-drag"
      leading={
        hidden && (
          <div
            data-clear-traffic-lights={trafficLights || undefined}
            className="app-region-no-drag flex shrink-0 items-center gap-0.5 data-clear-traffic-lights:pl-16 md:data-clear-traffic-lights:pl-10"
          >
            <SidebarToggle />
            <TitleBarControls {...controls} />
          </div>
        )
      }
    >
      {children}
    </PageShellHeader>
  );
}
