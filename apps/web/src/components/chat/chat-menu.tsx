import overflowMenuHorizontal from "@carbon/icons/es/overflow-menu--horizontal/16.js";
import { pinKey } from "@crm/core/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { SpaceDot, type SpaceDotColor } from "@crm/ui/components/space-dot";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { type Chat, deleteChatMutation, updateChatMutation } from "../../lib/chats.ts";
import { folderOf } from "../../lib/sidebar-layout.ts";
import type { ChatsApi } from "./use-chats.ts";

export const MenuIcon = carbonIcon(overflowMenuHorizontal);

/** What the menu asks its owner to open: dialogs live outside the menu so it can close first. */
export type ChatMenuRequest =
  | { readonly kind: "rename"; readonly chat: Chat }
  | { readonly kind: "new-folder"; readonly chat: Chat };

export function spaceColor(color: string): SpaceDotColor {
  return color === "blue" ||
    color === "orange" ||
    color === "green" ||
    color === "purple" ||
    color === "pink"
    ? color
    : "gray";
}

export interface ChatMenuProps {
  readonly chat: Chat;
  readonly api: ChatsApi;
  readonly userId: string;
  readonly workspaceId: string;
  readonly trigger: ReactElement;
  readonly onRequest: (request: ChatMenuRequest) => void;
}

/** A chat's `…` menu: pin, folder, space, rename, delete (ADR 0018 says who may do what). */
export function ChatMenu({ chat, api, userId, workspaceId, trigger, onRequest }: ChatMenuProps) {
  const navigate = useNavigate();

  const open = useRouterState({
    select: (state) => state.location.pathname === `/chats/${chat.id}`,
  });

  const pinned = api.layout.pinned.includes(pinKey("chat", chat.id));
  const folder = folderOf(api.layout.folders, chat.id);
  const mine = chat.created_by_id === userId;

  const update = useMutation({
    ...updateChatMutation,
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    ...deleteChatMutation,
    onSuccess: () => api.forgetChat(chat.id),
    onError: (error) => toast.error(error.message),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => api.togglePin(pinKey("chat", chat.id))}>
          {pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to folder</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {api.layout.folders.map((item) => (
              <DropdownMenuItem
                key={item.id}
                disabled={item.id === folder?.id}
                onClick={() => api.moveToFolder(chat.id, item.id)}
              >
                {item.name}
              </DropdownMenuItem>
            ))}
            {api.layout.folders.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => onRequest({ kind: "new-folder", chat })}>
              New folder…
            </DropdownMenuItem>
            {folder && (
              <DropdownMenuItem onClick={() => api.moveToFolder(chat.id, null)}>
                Remove from folder
              </DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to space</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {/* Only the person who started a chat may take it out of a shared space. */}
            {(mine || chat.space_id === null) && (
              <DropdownMenuItem
                disabled={chat.space_id === null}
                onClick={() => update.mutate({ workspaceId, id: chat.id, spaceId: null })}
              >
                <SpaceDot color="private" />
                Private
              </DropdownMenuItem>
            )}
            {api.spaces.map((space) => (
              <DropdownMenuItem
                key={space.id}
                disabled={chat.space_id === space.id}
                onClick={() => update.mutate({ workspaceId, id: chat.id, spaceId: space.id })}
              >
                <SpaceDot color={spaceColor(space.color)} />
                {space.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={() => onRequest({ kind: "rename", chat })}>
          Rename…
        </DropdownMenuItem>
        {mine && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (open) void navigate({ to: "/" });

                remove.mutate({ workspaceId, id: chat.id });
              }}
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
