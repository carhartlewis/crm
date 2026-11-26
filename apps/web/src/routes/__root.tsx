import { Toaster } from "@crm/ui/components/sonner";
import { ThemeProvider } from "@crm/ui/components/theme-provider";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { SessionWatcher } from "../components/session-watcher.tsx";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <SessionWatcher />
        <Outlet />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
