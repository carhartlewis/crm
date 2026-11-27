import edit from "@carbon/icons/es/edit/16.js";
import { buttonVariants } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
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
import { JoinSpaceButton, SpaceMenu } from "../../../../components/chat/space-actions.tsx";
import { type ChatsApi, useChats } from "../../../../components/chat/use-chats.ts";
import type { Chat } from "../../../../lib/chats.ts";
import { WorkspacePageHeader } from "../../../../components/shell/page-header.tsx";

const EditIcon = carbonIcon(edit);

export const Route = createLazyFileRoute("/_authed/_workspace/spaces/$spaceId")({
  component: SpacePage,
});

/** The chats of one space, newest message first; `private` is your private chats. */
function SpacePage() {
  const { spaceId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const workspaceId = session.session.activeOrganizationId ?? "";

  return (
    <SpaceView
      key={`${workspaceId}:${spaceId}`}
      spaceId={spaceId}
      userId={session.user.id}
      workspaceId={workspaceId}
    />
  );
}

function SpaceView({
  spaceId,
  userId,
  workspaceId,
}: {
  spaceId: string;
  userId: string;
  workspaceId: string;
}) {
  const api = useChats(workspaceId, userId);
  const isPrivate = spaceId === "private";
  const space = api.spaces.find((item) => item.id === spaceId);
  const joined = isPrivate || api.joinedSpaceIds.has(spaceId);

  const chats = api.chats
    .filter((chat) =>
      isPrivate
        ? chat.space_id === null && chat.created_by_id === userId
        : chat.space_id === spaceId,
    )
    .toSorted((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  const title = isPrivate ? "Private" : (space?.name ?? "Space");
  const members = api.membersOf(spaceId).length;

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
          {joined && (
            <Link
              to="/"
              search={isPrivate ? {} : { space: spaceId }}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <EditIcon />
              New chat
            </Link>
          )}
          {space && <SpaceMenu space={space} api={api} userId={userId} workspaceId={workspaceId} />}
        </PageShellActions>
      </WorkspacePageHeader>
      <PageShellContent>
        <SpaceBody
          spaceId={spaceId}
          userId={userId}
          workspaceId={workspaceId}
          api={api}
          chats={chats}
          joined={joined}
          members={members}
        />
      </PageShellContent>
    </PageShell>
  );
}

/** What a space holds: its description, a Join button for non-members, and its chats. */
function SpaceBody({
  spaceId,
  userId,
  workspaceId,
  api,
  chats,
  joined,
  members,
}: {
  spaceId: string;
  userId: string;
  workspaceId: string;
  api: ChatsApi;
  chats: readonly Chat[];
  joined: boolean;
  members: number;
}) {
  const isPrivate = spaceId === "private";
  const space = api.spaces.find((item) => item.id === spaceId);

  return (
    <div className="animate-enter flex flex-col gap-2">
      {space && (
        <p className="text-sm text-pretty text-muted-foreground">
          {space.description && <span className="select-text">{space.description} · </span>}
          {members} {members === 1 ? "member" : "members"}
        </p>
      )}
      {!joined && space && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-pretty text-muted-foreground">
            Join this space to see its chats and start new ones in it.
          </p>
          <JoinSpaceButton space={space} api={api} userId={userId} workspaceId={workspaceId} />
        </div>
      )}
      {joined && api.isReady && chats.length === 0 && (
        <p className="text-sm text-pretty text-muted-foreground">
          {isPrivate ? "Chats only you see appear here." : "No chats in this space yet."}
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
  );
}
