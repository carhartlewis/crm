import {
  PreviewCard,
  PreviewCardContent,
  PreviewCardTrigger,
} from "@crm/ui/components/preview-card";
import { SidebarMenuButton } from "@crm/ui/components/sidebar";
import { Skeleton } from "@crm/ui/components/skeleton";
import { preloadable } from "@crm/ui/lib/preloadable";
import { ForesightManager, useForesight } from "@foresightjs/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import type { Page } from "../../lib/pages.ts";
import { workspaceQuery } from "../../lib/session.ts";
import type { Shortcut } from "../../lib/shortcuts.ts";

// ForesightJS tags tracked elements with data-active/data-status by default, which our sidebar
// styles read as "selected" (and which clobbers TanStack Router's data-status).
ForesightManager.instance.alterGlobalSettings({ setDataAttributes: false });

const PeekContent = preloadable(() => import("./peek-content.tsx"));

export interface NavLinkProps {
  readonly page: Page;
  readonly active: boolean;
  readonly shortcut: Shortcut | undefined;
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * A pinned page in the sidebar. ForesightJS predicts the click from pointer velocity and
 * preloads the route before it lands; hover or focus also warms the peek's chunk and the
 * workspace data, so the peek opens complete.
 */
export function NavLink({ page, active, shortcut, userId, workspaceId }: NavLinkProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { elementRef } = useForesight<HTMLAnchorElement>({
    name: `nav:${page.id}`,
    hitSlop: 8,
    callback: () => router.preloadRoute({ to: page.to }),
  });

  const PageIcon = page.icon;

  const warm = () => {
    void PeekContent.preload();
    void queryClient.prefetchQuery(workspaceQuery(userId, workspaceId));
  };

  return (
    <PreviewCard>
      <SidebarMenuButton
        isActive={active}
        onPointerEnter={warm}
        onFocus={warm}
        render={
          <PreviewCardTrigger render={<Link to={page.to} ref={elementRef} draggable={false} />} />
        }
      >
        <PageIcon />
        <span>{page.label}</span>
      </SidebarMenuButton>
      <PreviewCardContent>
        <Suspense fallback={<PeekSkeleton />}>
          <PeekContent page={page} shortcut={shortcut} userId={userId} workspaceId={workspaceId} />
        </Suspense>
      </PreviewCardContent>
    </PreviewCard>
  );
}

function PeekSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-6 w-1/2" />
    </div>
  );
}
