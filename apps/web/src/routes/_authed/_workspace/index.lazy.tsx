import { Card, CardDescription, CardHeader, CardTitle } from "@crm/ui/components/card";
import { Kbd, KbdGroup } from "@crm/ui/components/kbd";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { pageById } from "../../../lib/pages.ts";
import { usePinnedOrder } from "../../../lib/pinned-order.ts";
import { sessionQuery, workspacesQuery } from "../../../lib/session.ts";
import { pinnedShortcut, shortcutKeys } from "../../../lib/shortcuts.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/")({
  component: Home,
});

function Home() {
  const { greeting: hello } = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const { data: current } = useSuspenseQuery(sessionQuery);
  const { data: workspaces } = useSuspenseQuery(workspacesQuery(session.user.id));
  const order = usePinnedOrder(session.user.id);

  const active = workspaces.find(
    (workspace) => workspace.id === current?.session.activeOrganizationId,
  );

  const firstName = session.user.name.split(/\s+/)[0] ?? "";

  return (
    <PageShell>
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>{`${hello}, ${firstName}`}</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <span className="text-muted-foreground">{active?.name}</span>
        </PageShellActions>
      </PageShellHeader>
      <PageShellContent>
        <div className="animate-enter enter-delay-1 grid gap-3 sm:grid-cols-2">
          {order.map((id, index) => {
            const page = pageById(id);
            const PageIcon = page.icon;
            const shortcut = pinnedShortcut(index);

            return (
              <Link
                key={id}
                to={page.to}
                className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <PageIcon className="text-muted-foreground" />
                        {page.label}
                        {shortcut && (
                          <KbdGroup className="ml-auto">
                            {shortcutKeys(shortcut).map((key) => (
                              <Kbd key={key}>{key}</Kbd>
                            ))}
                          </KbdGroup>
                        )}
                      </span>
                    </CardTitle>
                    <CardDescription>{page.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </PageShellContent>
    </PageShell>
  );
}
