import { Button } from "@crm/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@crm/ui/components/card";
import { SpaceDot } from "@crm/ui/components/space-dot";
import { FormattedDate } from "@crm/ui/patterns/formatted-date";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { spaceColor } from "../../../../components/chat/chat-menu.tsx";
import { useChats } from "../../../../components/chat/use-chats.ts";
import { WorkspacePageHeader } from "../../../../components/shell/page-header.tsx";

export const Route = createLazyFileRoute("/_authed/_workspace/spaces/$spaceId")({
  component: SpacePage,
});

/** The chats of one space, newest message first; `private` is your private chats. */
function SpacePage() {
  const { spaceId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const userId = session.user.id;
  const api = useChats(session.session.activeOrganizationId ?? "", userId);
  const isPrivate = spaceId === "private";
  const space = api.spaces.find((item) => item.id === spaceId);

  const chats = api.chats
    .filter((chat) =>
      isPrivate
        ? chat.space_id === null && chat.created_by_id === userId
        : chat.space_id === spaceId,
    )
    .toSorted((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  const title = isPrivate ? "Private" : (space?.name ?? "Space");

  return (
    <PageShell width="narrow">
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle>
            <span className="flex min-w-0 items-center gap-2">
              <SpaceDot color={space ? spaceColor(space.color) : "private"} />
              <span className="truncate">{title}</span>
            </span>
          </PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <Button size="sm" render={<Link to="/" search={isPrivate ? {} : { space: spaceId }} />}>
            New chat
          </Button>
        </PageShellActions>
      </WorkspacePageHeader>
      <PageShellContent>
        <div className="animate-enter flex flex-col gap-2">
          {api.isReady && chats.length === 0 && (
            <p className="text-sm text-pretty text-muted-foreground">
              {isPrivate
                ? "Chats only you see appear here."
                : "No chats yet. Chats in this space are shared with everyone in the workspace."}
            </p>
          )}
          {chats.map((chat) => (
            <Link
              key={chat.id}
              to="/chats/$chatId"
              params={{ chatId: chat.id }}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="select-text">{chat.title}</CardTitle>
                  <CardDescription>
                    <FormattedDate value={chat.last_message_at} />
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </PageShellContent>
    </PageShell>
  );
}
