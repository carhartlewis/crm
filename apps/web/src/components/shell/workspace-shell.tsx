import { SidebarInset, SidebarProvider, useSidebar } from "@crm/ui/components/sidebar";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { preloadable } from "@crm/ui/lib/preloadable";
import { Outlet } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { AppSidebar } from "./app-sidebar.tsx";
import { Shortcuts } from "./shortcuts.tsx";
import { SidebarToggle, trafficLights } from "./sidebar-toggle.tsx";

const CommandPalette = preloadable(() => import("./command-palette.tsx"));

export interface WorkspaceShellProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/** The signed-in frame: sidebar, the page, ⌘K and the global shortcuts. */
export function WorkspaceShell({ userId, workspaceId }: WorkspaceShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // The palette is keyboard-first: have its chunk ready before anyone presses ⌘K.
  useMountEffect(() => {
    const idle = requestIdleCallback(() => void CommandPalette.preload());

    return () => cancelIdleCallback(idle);
  });

  // Tooltips are only used in here; providing them at the root pulled floating-ui into cold entry.
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          userId={userId}
          workspaceId={workspaceId}
          onSearch={() => setPaletteOpen(true)}
          onSearchIntent={() => void CommandPalette.preload()}
        />
        <SidebarInset className="min-w-0">
          <InsetBar />
          <Outlet />
        </SidebarInset>
        <Shortcuts key={userId} userId={userId} setPaletteOpen={setPaletteOpen} />
        {paletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette open onOpenChange={setPaletteOpen} userId={userId} />
          </Suspense>
        )}
      </SidebarProvider>
    </TooltipProvider>
  );
}

/**
 * The page panel's title bar: a window drag area with the sidebar toggle at its left. When the
 * sidebar hides on macOS desktop, it moves clear of the traffic lights.
 */
function InsetBar() {
  const { state, isMobile } = useSidebar();
  const hidden = state === "collapsed" || isMobile;

  return (
    <div
      data-clear-traffic-lights={(hidden && trafficLights) || undefined}
      className="app-region-drag flex h-12 shrink-0 items-center px-3 data-clear-traffic-lights:pl-20"
    >
      <SidebarToggle />
    </div>
  );
}
