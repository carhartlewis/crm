import { Toaster } from "@crm/ui/components/sonner";
import { ThemeProvider } from "@crm/ui/components/theme-provider";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { SessionWatcher } from "../components/session-watcher.tsx";
import type { RouterContext } from "../router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <SessionWatcher />
      <Outlet />
      <Toaster />
    </ThemeProvider>
  );
}
