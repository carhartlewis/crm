import add from "@carbon/icons/es/add/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import folderIcon from "@carbon/icons/es/folder/16.js";
import logout from "@carbon/icons/es/logout/16.js";
import pinGlyph from "@carbon/icons/es/pin/16.js";
import pinFilled from "@carbon/icons/es/pin--filled/16.js";
import { chatTitleError, folderNameError, parsePinKey, pinKey } from "@crm/core/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@crm/ui/components/sidebar";
import { SpaceDot } from "@crm/ui/components/space-dot";
import { useMutation } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  type Chat,
  type ChatSpace,
  leaveSpaceMutation,
  updateChatMutation,
} from "../../lib/chats.ts";
import { haptic } from "../../lib/haptics.ts";
import { isPageId, pageById, pageForPath } from "../../lib/pages.ts";
import { pinnedShortcut } from "../../lib/shortcuts.ts";
import { recentChats } from "../../lib/sidebar-layout.ts";
import { type ChatMenuRequest, MenuIcon, spaceColor } from "../chat/chat-menu.tsx";
import { NameDialog } from "../chat/name-dialog.tsx";
import { type ChatsApi, reorderPinnedAt, useChats } from "../chat/use-chats.ts";
import { NavLink } from "./nav-link.tsx";
import { reorderable } from "./reorder.ts";
import { RowShortcut } from "./row-shortcut.tsx";

const AddIcon = carbonIcon(add);
const ChevronIcon = carbonIcon(chevronRight);
const FolderIcon = carbonIcon(folderIcon);
const PinIcon = carbonIcon(pinGlyph);
const PinnedIcon = carbonIcon(pinFilled);
const LeaveIcon = carbonIcon(logout);

type Dialog =
  | ChatMenuRequest
  | { readonly kind: "new-folder-empty" }
  | { readonly kind: "rename-folder"; readonly id: string; readonly name: string };

interface NavProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * The chat part of the sidebar (ADR 0018): Pinned (pages, spaces and chats in one order),
 * Spaces, Folders and Recents. Loaded as its own chunk with the synced chats; until then the
 * shell shows the pinned pages alone.
 */
export default function ChatNav({ userId, workspaceId }: NavProps) {
  const api = useChats(workspaceId, userId);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const rowProps = { api, userId, workspaceId, pathname, onRequest: setDialog };

  return (
    <div>
      <PinnedGroup {...rowProps} />
      <FoldersGroup {...rowProps} />
      <RecentsGroup {...rowProps} />
      {dialog && (
        <ChatDialogs
          dialog={dialog}
          api={api}
          workspaceId={workspaceId}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

interface RowProps extends NavProps {
  readonly api: ChatsApi;
  readonly pathname: string;
  readonly onRequest: (dialog: Dialog) => void;
}

/** Pinned: drag to reorder (a haptic tick per slot), ⌥1–⌥9 to open the first nine. */
function PinnedGroup({ api, userId, workspaceId, pathname, onRequest }: RowProps) {
  // Pins whose chat or space is gone (deleted, or not synced yet) are skipped, not shown empty.
  const visible = api.layout.pinned.flatMap((key, index) => {
    const entry = parsePinKey(key);

    if (!entry) return [];

    if (entry.kind === "page") return isPageId(entry.id) ? [{ key, index, pin: entry }] : [];

    if (entry.kind === "chat") return api.chatById(entry.id) ? [{ key, index, pin: entry }] : [];

    return api.spaces.some((space) => space.id === entry.id) ? [{ key, index, pin: entry }] : [];
  });

  const activePage = pageForPath(pathname)?.id;

  // Rows carry their place in the whole order (`data-pin-index`), so the drop maps the shown
  // slots back to it; the save reads the current row itself, so this callback stays stable.
  const listRef = useCallback(
    (list: HTMLUListElement | null) =>
      reorderable({
        onSlotChange: haptic,
        onCommit: (from, to) => {
          const rows = list ? [...list.querySelectorAll<HTMLElement>("[data-pin-index]")] : [];
          const source = Number(rows[from]?.dataset["pinIndex"]);
          const target = Number(rows[to]?.dataset["pinIndex"]);

          if (Number.isInteger(source) && Number.isInteger(target)) {
            reorderPinnedAt(workspaceId, userId, source, target);
          }
        },
      })(list),
    [workspaceId, userId],
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
      <SidebarMenu ref={listRef} aria-label="Pinned">
        {visible.map(({ key, index: pinIndex, pin: item }, index) => {
          const shortcut = pinnedShortcut(index);

          if (item.kind === "page" && isPageId(item.id)) {
            return (
              <SidebarMenuItem key={key} data-reorder-item data-pin-index={pinIndex}>
                <NavLink
                  page={pageById(item.id)}
                  active={item.id === activePage}
                  shortcut={shortcut}
                  userId={userId}
                  workspaceId={workspaceId}
                />
              </SidebarMenuItem>
            );
          }

          const chat = item.kind === "chat" ? api.chatById(item.id) : undefined;

          if (chat) {
            return (
              <ChatRow
                key={key}
                chat={chat}
                icon={<PinIcon />}
                shortcutIndex={index}
                pinIndex={pinIndex}
                api={api}
                userId={userId}
                workspaceId={workspaceId}
                pathname={pathname}
                onRequest={onRequest}
              />
            );
          }

          const space = api.spaces.find((entry) => entry.id === item.id);

          return space ? (
            <SpaceRow
              key={key}
              space={space}
              shortcutIndex={index}
              pinIndex={pinIndex}
              api={api}
              userId={userId}
              workspaceId={workspaceId}
              pathname={pathname}
              onRequest={onRequest}
            />
          ) : null;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function FoldersGroup({ api, userId, workspaceId, pathname, onRequest }: RowProps) {
  const pinned = new Set(api.layout.pinned);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());

  if (api.layout.folders.length === 0) return null;

  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);

      if (!next.delete(id)) next.add(id);

      return next;
    });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Folders</SidebarGroupLabel>
      <SidebarGroupAction
        aria-label="New folder"
        onClick={() => onRequest({ kind: "new-folder-empty" })}
      >
        <AddIcon />
      </SidebarGroupAction>
      <SidebarMenu aria-label="Folders">
        {api.layout.folders.map((folder) => {
          const open = !closed.has(folder.id);

          // A pinned chat shows once, in Pinned.
          const chats = folder.chatIds.flatMap((id) =>
            pinned.has(pinKey("chat", id)) ? [] : (api.chatById(id) ?? []),
          );

          return (
            <SidebarMenuItem key={folder.id}>
              <SidebarMenuButton aria-expanded={open} onClick={() => toggle(folder.id)}>
                <FolderIcon />
                <span>{folder.name}</span>
                <ChevronIcon
                  data-open={open || undefined}
                  className="ml-auto transition-transform data-open:rotate-90"
                />
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuAction showOnHover aria-label={`${folder.name} options`}>
                      <MenuIcon />
                    </SidebarMenuAction>
                  }
                />
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() =>
                      onRequest({ kind: "rename-folder", id: folder.id, name: folder.name })
                    }
                  >
                    Rename…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => api.removeFolder(folder.id)}
                  >
                    Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {open && chats.length > 0 && (
                <SidebarMenuSub>
                  {chats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      api={api}
                      userId={userId}
                      workspaceId={workspaceId}
                      pathname={pathname}
                      onRequest={onRequest}
                    />
                  ))}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function RecentsGroup({ api, userId, workspaceId, pathname, onRequest }: RowProps) {
  const recents = recentChats(api.chats, api.layout, userId, api.joinedSpaceIds);

  if (recents.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recents</SidebarGroupLabel>
      <SidebarMenu aria-label="Recents">
        {recents.map((chat) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            api={api}
            userId={userId}
            workspaceId={workspaceId}
            pathname={pathname}
            onRequest={onRequest}
          />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

interface ChatRowProps extends RowProps {
  readonly chat: Chat;
  readonly icon?: React.ReactNode;
  readonly shortcutIndex?: number;
  /** Its place in the Pinned order, when it is a pinned row (drag to reorder). */
  readonly pinIndex?: number;
}

/** A chat in the sidebar. Hovering preloads its route, so its history is fetched before the click. */
function ChatRow({ chat, icon, shortcutIndex, pinIndex, ...props }: ChatRowProps) {
  const shortcut = shortcutIndex === undefined ? undefined : pinnedShortcut(shortcutIndex);
  const key = pinKey("chat", chat.id);
  const pinned = props.api.layout.pinned.includes(key);

  return (
    <SidebarMenuItem
      data-reorder-item={pinIndex === undefined ? undefined : true}
      data-pin-index={pinIndex}
    >
      <SidebarMenuButton
        isActive={props.pathname === `/chats/${chat.id}`}
        render={<Link to="/chats/$chatId" params={{ chatId: chat.id }} draggable={false} />}
      >
        {icon}
        <span>{chat.title}</span>
        <RowShortcut shortcut={shortcut} />
      </SidebarMenuButton>
      {/* As for spaces: pin or unpin on hover; the chat's other actions are in its page header. */}
      <SidebarMenuAction
        showOnHover
        aria-label={pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
        onClick={() => props.api.togglePin(key)}
      >
        {pinned ? <PinnedIcon /> : <PinIcon />}
      </SidebarMenuAction>
    </SidebarMenuItem>
  );
}

interface SpaceRowProps extends RowProps {
  readonly space: ChatSpace;
  readonly shortcutIndex?: number;
  readonly pinIndex?: number;
}

function SpaceRow({ space, shortcutIndex, pinIndex, ...props }: SpaceRowProps) {
  const { api, workspaceId, userId } = props;
  const shortcut = shortcutIndex === undefined ? undefined : pinnedShortcut(shortcutIndex);
  const joined = api.joinedSpaceIds.has(space.id);

  const leave = useMutation({
    ...leaveSpaceMutation,
    onError: (error) => toast.error(error.message),
  });

  // As in Glass: a pinned space shows Unpin and Leave on hover; its other actions are on its page.
  return (
    <SidebarMenuItem
      data-reorder-item={pinIndex === undefined ? undefined : true}
      data-pin-index={pinIndex}
    >
      <SidebarMenuButton
        isActive={props.pathname === `/spaces/${space.id}`}
        render={<Link to="/spaces/$spaceId" params={{ spaceId: space.id }} draggable={false} />}
      >
        <SpaceDot color={spaceColor(space.color)} />
        <span>{space.name}</span>
        <RowShortcut shortcut={shortcut} />
      </SidebarMenuButton>
      <SidebarMenuAction
        showOnHover
        className={joined ? "right-7" : undefined}
        aria-label={`Unpin ${space.name}`}
        onClick={() => api.togglePin(pinKey("space", space.id))}
      >
        <PinnedIcon />
      </SidebarMenuAction>
      {joined && (
        <SidebarMenuAction
          showOnHover
          aria-label={`Leave ${space.name}`}
          onClick={() => leave.mutate({ workspaceId, userId, spaceId: space.id })}
        >
          <LeaveIcon />
        </SidebarMenuAction>
      )}
    </SidebarMenuItem>
  );
}

/** The name dialogs the sidebar opens: rename a chat, a folder or a space; make one. */
function ChatDialogs({
  dialog,
  api,
  workspaceId,
  onClose,
}: {
  dialog: Dialog;
  api: ChatsApi;
  workspaceId: string;
  onClose: () => void;
}) {
  const updateChat = useMutation(updateChatMutation);
  const common = { onClose };

  switch (dialog.kind) {
    case "rename":
      return (
        <NameDialog
          {...common}
          title="Rename chat"
          label="Title"
          action="Rename"
          initial={dialog.chat.title}
          validate={chatTitleError}
          onSave={(title) => updateChat.mutateAsync({ workspaceId, id: dialog.chat.id, title })}
        />
      );
    case "new-folder":
    case "new-folder-empty":
      return (
        <NameDialog
          {...common}
          title="New folder"
          description="Folders are yours: teammates don't see them."
          label="Name"
          action="Create folder"
          validate={folderNameError}
          onSave={async (name) => {
            api.addFolder(name, dialog.kind === "new-folder" ? dialog.chat.id : undefined);
          }}
        />
      );
    case "rename-folder":
      return (
        <NameDialog
          {...common}
          title="Rename folder"
          label="Name"
          action="Rename"
          initial={dialog.name}
          validate={folderNameError}
          onSave={async (name) => api.renameFolder(dialog.id, name)}
        />
      );
    default:
      return null;
  }
}
