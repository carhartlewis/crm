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
 * (a drag area). The sidebar toggle leads it, on the title's line; when the sidebar is hidden,
 * search, back and forward join it, and on macOS it clears the traffic lights.
 */
export function WorkspacePageHeader({ children }: { children: ReactNode }) {
  const { state, isMobile } = useSidebar();
  const controls = use(TitleBarContext);
  const hidden = state === "collapsed" || isMobile;

  return (
    <PageShellHeader
      className="app-region-drag"
      leading={
        <div
          data-clear-traffic-lights={(hidden && trafficLights) || undefined}
          className="app-region-no-drag flex shrink-0 items-center gap-0.5 data-clear-traffic-lights:pl-14"
        >
          <SidebarToggle />
          {hidden && <TitleBarControls {...controls} />}
        </div>
      }
    >
      {children}
    </PageShellHeader>
  );
}
