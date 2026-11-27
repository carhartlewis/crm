import { Button } from "@crm/ui/components/button";
import { SpaceDot } from "@crm/ui/components/space-dot";
import {
  PageShell,
  PageShellActions,
  PageShellHeading,
  PageShellTitle,
} from "@crm/ui/patterns/page-shell";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ChatMenu,
  type ChatMenuRequest,
  MenuIcon,
  spaceColor,
} from "../../../../components/chat/chat-menu.tsx";
import { ChatView } from "../../../../components/chat/chat-view.tsx";
import { NameDialog } from "../../../../components/chat/name-dialog.tsx";
import { useChats } from "../../../../components/chat/use-chats.ts";
import { WorkspacePageHeader } from "../../../../components/shell/page-header.tsx";
import { peekFirstMessage } from "../../../../lib/chat-api.ts";
import { updateChatMutation } from "../../../../lib/chats.ts";
import { chatTitleError, folderNameError } from "@crm/core/chat";
import { useMutation } from "@tanstack/react-query";

export const Route = createLazyFileRoute("/_authed/_workspace/chats/$chatId")({
  component: ChatPage,
});

/** One chat, full size in the content area. */
function ChatPage() {
  const { chatId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const history = Route.useLoaderData();
  const userId = session.user.id;
  const workspaceId = session.session.activeOrganizationId ?? "";
  const api = useChats(workspaceId, userId);
  const chat = api.chatById(chatId);
  const space = api.spaces.find((item) => item.id === chat?.space_id);
  const [dialog, setDialog] = useState<ChatMenuRequest | null>(null);

  const rename = useMutation({
    ...updateChatMutation,
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell contained width="full">
      <WorkspacePageHeader>
        <PageShellHeading>
          <PageShellTitle className="select-text">{chat?.title ?? "Chat"}</PageShellTitle>
        </PageShellHeading>
        <PageShellActions>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground select-none">
            <SpaceDot color={space ? spaceColor(space.color) : "private"} />
            {space?.name ?? "Private"}
          </span>
          {chat && (
            <ChatMenu
              chat={chat}
              api={api}
              userId={userId}
              workspaceId={workspaceId}
              onRequest={setDialog}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Chat options">
                  <MenuIcon />
                </Button>
              }
            />
          )}
        </PageShellActions>
      </WorkspacePageHeader>
      <ChatView
        // Another chat is another session: a fresh store and stream.
        key={chatId}
        chatId={chatId}
        userId={userId}
        permissionMode={chat?.permission_mode ?? "manual"}
        onPermissionModeChange={(mode) =>
          rename.mutate({ workspaceId, id: chatId, permissionMode: mode })
        }
        history={history}
        firstMessage={peekFirstMessage(chatId)}
      />
      {dialog?.kind === "rename" && (
        <NameDialog
          title="Rename chat"
          label="Title"
          action="Rename"
          initial={dialog.chat.title}
          validate={chatTitleError}
          onSave={(title) => rename.mutateAsync({ workspaceId, id: dialog.chat.id, title })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "new-folder" && (
        <NameDialog
          title="New folder"
          description="Folders are yours: teammates don't see them."
          label="Name"
          action="Create folder"
          validate={folderNameError}
          onSave={async (name) => {
            api.addFolder(name, dialog.chat.id);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </PageShell>
  );
}
