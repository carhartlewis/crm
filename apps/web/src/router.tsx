import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RouteError, RouteNotFound, RoutePending } from "./components/route-states.tsx";
import { routeTree } from "./routeTree.gen.ts";

/** New chat and each chat: one screen with the composer at the bottom. */
const isChatPath = (pathname: string) => pathname === "/" || pathname.startsWith("/chats/");

/** What every route's `beforeLoad` and `loader` receive. Layouts extend it (e.g. `session`). */
export interface RouterContext {
  queryClient: QueryClient;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

export const router = createRouter({
  routeTree,
  context: { queryClient } satisfies RouterContext,
  // The router owns its providers, so route components and pending/error states can use them.
  Wrap: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ),
  defaultPreload: "intent",
  defaultPreloadDelay: 50,
  defaultPreloadStaleTime: 0,
  // Route changes cross-fade (styled in @crm/ui globals.css, reduced-motion aware), except
  // between chats: the composer stays in place and only the conversation changes.
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) =>
      fromLocation && isChatPath(fromLocation.pathname) && isChatPath(toLocation.pathname)
        ? false
        : [],
  },
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
