import { SidebarInset, SidebarProvider } from "@crm/ui/components/sidebar";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { preloadable } from "@crm/ui/lib/preloadable";
import { Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { Suspense, useState } from "react";
import { AppSidebar } from "./app-sidebar.tsx";
import { Shortcuts } from "./shortcuts.tsx";
import { TitleBarContext } from "./page-header.tsx";

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

  // Tooltips and URL state (nuqs: ?company=…, filters) are only used in here; providing them at
  // the root would put their code in the cold-entry bundle.
  return (
    <NuqsAdapter>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar
            userId={userId}
            workspaceId={workspaceId}
            onSearch={() => setPaletteOpen(true)}
            onSearchIntent={() => void CommandPalette.preload()}
          />
          <SidebarInset className="min-w-0">
            <TitleBarContext
              value={{
                onSearch: () => setPaletteOpen(true),
                onSearchIntent: () => void CommandPalette.preload(),
              }}
            >
              <Outlet />
            </TitleBarContext>
          </SidebarInset>
          <Shortcuts userId={userId} setPaletteOpen={setPaletteOpen} />
          {paletteOpen && (
            <Suspense fallback={null}>
              <CommandPalette open onOpenChange={setPaletteOpen} userId={userId} />
            </Suspense>
          )}
        </SidebarProvider>
      </TooltipProvider>
    </NuqsAdapter>
  );
}
