import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteError, RouteNotFound, RoutePending } from "./components/route-states.tsx";
import { routeTree } from "./routeTree.gen.ts";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadDelay: 50,
  defaultPreloadStaleTime: 0,
  // Every route change cross-fades (styled in @crm/ui globals.css, reduced-motion aware).
  defaultViewTransition: true,
  defaultErrorComponent: RouteError,
  defaultPendingComponent: RoutePending,
  defaultNotFoundComponent: RouteNotFound,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
