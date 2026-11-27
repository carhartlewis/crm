import { Button } from "@crm/ui/components/button";
import { SpaceDot } from "@crm/ui/components/space-dot";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { spaceColor } from "../../../../components/chat/chat-menu.tsx";
import { SpaceActions } from "../../../../components/chat/space-actions.tsx";
import { useChats } from "../../../../components/chat/use-chats.ts";
import { WorkspacePageHeader } from "../../../../components/shell/page-header.tsx";
import { useCreateSheet } from "../../../../lib/create-sheet.ts";

export const Route = createLazyFileRoute("/_authed/_workspace/spaces/")({
  component: SpacesPage,
});

/** Every space: Private first, then the workspace's spaces, with Pin and Join on each row. */
function SpacesPage() {
  const { session } = Route.useRouteContext();
  const userId = session.user.id;
  const workspaceId = session.session.activeOrganizationId ?? "";

  return <SpacesList key={workspaceId} userId={userId} workspaceId={workspaceId} />;
}

function SpacesList({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const api = useChats(workspaceId, userId);
  const [, setCreate] = useCreateSheet();

  return (
    <PageShell width="narrow">
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>Spaces</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <Button size="sm" onClick={() => void setCreate("space")}>
            New space
          </Button>
        </PageShellActions>
      </WorkspacePageHeader>
      <PageShellContent>
        <ul className="animate-enter flex flex-col">
          <li className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
            <Link
              to="/spaces/$spaceId"
              params={{ spaceId: "private" }}
              className="flex min-w-0 flex-1 items-center gap-3 outline-none"
            >
              <SpaceDot color="private" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">Private</span>
                <span className="truncate text-xs text-muted-foreground">Chats only you see</span>
              </span>
            </Link>
          </li>
          {api.spaces.map((space) => {
            const members = api.membersOf(space.id).length;

            return (
              <li
                key={space.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
              >
                <Link
                  to="/spaces/$spaceId"
                  params={{ spaceId: space.id }}
                  className="flex min-w-0 flex-1 items-center gap-3 outline-none"
                >
                  <SpaceDot color={spaceColor(space.color)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium select-text">{space.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[space.description, `${members} ${members === 1 ? "member" : "members"}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
                <SpaceActions space={space} api={api} userId={userId} workspaceId={workspaceId} />
              </li>
            );
          })}
        </ul>
      </PageShellContent>
    </PageShell>
  );
}
