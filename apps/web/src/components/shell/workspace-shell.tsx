import { SidebarInset, SidebarProvider } from "@crm/ui/components/sidebar";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { preloadable } from "@crm/ui/lib/preloadable";
import { Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { useMutation } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { refreshMemoryFactsMutation } from "../../lib/memory.ts";
import { AppSidebar } from "./app-sidebar.tsx";
import { CreateSheets } from "./create-sheets.tsx";
import { RecordSheets } from "./record-sheets.tsx";
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
  const refreshFacts = useMutation(refreshMemoryFactsMutation);

  // Opening ⌘K asks the API to refresh stale fact copies; they arrive through sync while you type.
  const openPalette = () => {
    setPaletteOpen(true);

    if (!refreshFacts.isPending) refreshFacts.mutate();
  };

  const togglePalette = () => (paletteOpen ? setPaletteOpen(false) : openPalette());

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
            onSearch={openPalette}
            onSearchIntent={() => void CommandPalette.preload()}
          />
          <SidebarInset className="min-w-0">
            <TitleBarContext
              value={{
                onSearch: openPalette,
                onSearchIntent: () => void CommandPalette.preload(),
              }}
            >
              <Outlet />
            </TitleBarContext>
          </SidebarInset>
          <CreateSheets userId={userId} workspaceId={workspaceId} />
          <RecordSheets userId={userId} workspaceId={workspaceId} />
          <Shortcuts userId={userId} togglePalette={togglePalette} />
          {paletteOpen && (
            <Suspense fallback={null}>
              <CommandPalette
                open
                onOpenChange={setPaletteOpen}
                userId={userId}
                workspaceId={workspaceId}
              />
            </Suspense>
          )}
        </SidebarProvider>
      </TooltipProvider>
    </NuqsAdapter>
  );
}
