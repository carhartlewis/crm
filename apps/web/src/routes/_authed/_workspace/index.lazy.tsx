import chat from "@carbon/icons/es/chat/20.js";
import chevronDown from "@carbon/icons/es/chevron--down/16.js";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { SpaceDot } from "@crm/ui/components/space-dot";
import { PageShell } from "@crm/ui/patterns/page-shell";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Composer } from "../../../components/chat/composer.tsx";
import { spaceColor } from "../../../components/chat/chat-menu.tsx";
import { WorkspacePageHeader } from "../../../components/shell/page-header.tsx";
import { prewarmChat, queueFirstMessage, seedNewChat } from "../../../lib/chat-api.ts";
import { chatSpacesCollection, oldestFirst, startChatMutation } from "../../../lib/chats.ts";

const ChatIcon = carbonIcon(chat);
const ChevronIcon = carbonIcon(chevronDown);

export const Route = createLazyFileRoute("/_authed/_workspace/")({
  component: NewChat,
});

/** New chat: the composer and the space the chat starts in (ADR 0018). */
function NewChat() {
  const { session } = Route.useRouteContext();
  const workspaceId = session.session.activeOrganizationId ?? "";

  return <NewChatForm key={workspaceId} userId={session.user.id} workspaceId={workspaceId} />;
}

function NewChatForm({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const { space: spaceId } = Route.useSearch();

  // Read once per mount: the page remounts (`key`) for another workspace.
  const spaces = useLiveQuery(() => chatSpacesCollection(workspaceId));
  const spaceRows = oldestFirst(spaces.data);
  const space = spaceRows.find((item) => item.id === spaceId);

  const start = useMutation({
    ...startChatMutation,
    onSuccess: ({ id, sessionId }, { text }) => {
      // The chat page renders without a round trip and sends the message as it mounts.
      seedNewChat(queryClient, userId, id, sessionId);
      queueFirstMessage(id, text);
      void navigate({ to: "/chats/$chatId", params: { chatId: id } });
    },
    onError: (error) => toast.error(error.message),
  });

  const picker = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm">
            <span className="text-xs text-muted-foreground">Space</span>
            <SpaceDot color={space ? spaceColor(space.color) : "private"} />
            <span className="text-foreground">{space?.name ?? "Private"}</span>
            <ChevronIcon className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => void navigate({ to: "/", search: {} })}>
          <SpaceDot color="private" />
          Private
        </DropdownMenuItem>
        {spaceRows.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => void navigate({ to: "/", search: { space: item.id } })}
          >
            <SpaceDot color={spaceColor(item.color)} />
            {item.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <PageShell contained width="full">
      <WorkspacePageHeader>
        <span />
      </WorkspacePageHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="animate-enter flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center select-none">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ChatIcon className="size-5" />
          </span>
          <h1 className="text-2xl font-medium tracking-tight text-balance">What's on your mind?</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Ask a question, find something, or work through an idea.
          </p>
        </div>
        {/* As in Glass: the space sits on a strip above the composer, not inside it. */}
        <div className="animate-enter enter-delay-1 mx-auto w-full max-w-3xl px-4 pb-4">
          <div className="flex flex-col rounded-2xl bg-muted/50 p-1">
            <div className="flex items-center px-1 pb-1">{picker}</div>
            <Composer
              focusOnMount
              status={start.isPending || start.isSuccess ? "submitted" : "ready"}
              disabled={start.isPending || start.isSuccess}
              onTypingStart={() => prewarmChat()}
              onSend={(text) =>
                start.mutate({ workspaceId, userId, text, spaceId: space?.id ?? null })
              }
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
