import add from "@carbon/icons/es/add/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import folderIcon from "@carbon/icons/es/folder/16.js";
import pinGlyph from "@carbon/icons/es/pin/16.js";
import {
  chatTitleError,
  folderNameError,
  parsePinKey,
  pinKey,
  SPACE_COLORS,
  spaceNameError,
} from "@crm/core/chat";
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
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  type Chat,
  type ChatSpace,
  createSpaceMutation,
  deleteSpaceMutation,
  renameSpaceMutation,
  updateChatMutation,
} from "../../lib/chats.ts";
import { haptic } from "../../lib/haptics.ts";
import { isPageId, pageById, pageForPath } from "../../lib/pages.ts";
import { pinnedShortcut } from "../../lib/shortcuts.ts";
import { recentChats } from "../../lib/sidebar-layout.ts";
import { ChatMenu, type ChatMenuRequest, MenuIcon, spaceColor } from "../chat/chat-menu.tsx";
import { NameDialog } from "../chat/name-dialog.tsx";
import { type ChatsApi, reorderPinnedAt, useChats } from "../chat/use-chats.ts";
import { NavLink } from "./nav-link.tsx";
import { reorderable } from "./reorder.ts";
import { RowShortcut } from "./row-shortcut.tsx";

const AddIcon = carbonIcon(add);
const ChevronIcon = carbonIcon(chevronRight);
const FolderIcon = carbonIcon(folderIcon);
const PinIcon = carbonIcon(pinGlyph);

type Dialog =
  | ChatMenuRequest
  | { readonly kind: "new-space" }
  | { readonly kind: "rename-space"; readonly space: ChatSpace }
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
      <SpacesGroup {...rowProps} />
      <FoldersGroup {...rowProps} />
      <RecentsGroup {...rowProps} />
      {dialog && (
        <ChatDialogs
          dialog={dialog}
          api={api}
          userId={userId}
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

function SpacesGroup({ api, userId, workspaceId, pathname, onRequest }: RowProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Spaces</SidebarGroupLabel>
      <SidebarMenu aria-label="Spaces">
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname === "/spaces/private"}
            render={<Link to="/spaces/$spaceId" params={{ spaceId: "private" }} />}
          >
            <SpaceDot color="private" />
            <span>Private</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* A pinned space shows once, in Pinned. */}
        {api.spaces
          .filter((space) => !api.layout.pinned.includes(pinKey("space", space.id)))
          .map((space) => (
            <SpaceRow
              key={space.id}
              space={space}
              api={api}
              userId={userId}
              workspaceId={workspaceId}
              pathname={pathname}
              onRequest={onRequest}
            />
          ))}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={() => onRequest({ kind: "new-space" })}>
            <AddIcon />
            <span>Add space</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

function FoldersGroup({ api, userId, workspaceId, pathname, onRequest }: RowProps) {
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
            api.layout.pinned.includes(pinKey("chat", id)) ? [] : (api.chatById(id) ?? []),
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
  const recents = recentChats(api.chats, api.layout, userId);

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
      <ChatMenu
        chat={chat}
        api={props.api}
        userId={props.userId}
        workspaceId={props.workspaceId}
        onRequest={props.onRequest}
        trigger={
          <SidebarMenuAction showOnHover aria-label={`${chat.title} options`}>
            <MenuIcon />
          </SidebarMenuAction>
        }
      />
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
  const navigate = useNavigate();
  const shortcut = shortcutIndex === undefined ? undefined : pinnedShortcut(shortcutIndex);
  const pinned = api.layout.pinned.includes(pinKey("space", space.id));

  const remove = useMutation({
    ...deleteSpaceMutation,
    onSuccess: () => {
      if (pinned) api.togglePin(pinKey("space", space.id));
    },
    onError: (error) => toast.error(error.message),
  });

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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction showOnHover aria-label={`${space.name} options`}>
              <MenuIcon />
            </SidebarMenuAction>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => api.togglePin(pinKey("space", space.id))}>
            {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigate({ to: "/", search: { space: space.id } })}>
            New chat here
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => props.onRequest({ kind: "rename-space", space })}>
            Rename…
          </DropdownMenuItem>
          {/* The server also lets workspace admins delete; it refuses anyone else. */}
          {space.created_by_id === userId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => remove.mutate({ workspaceId, id: space.id })}
              >
                Delete space
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/** The name dialogs the sidebar opens: rename a chat, a folder or a space; make one. */
function ChatDialogs({
  dialog,
  api,
  userId,
  workspaceId,
  onClose,
}: {
  dialog: Dialog;
  api: ChatsApi;
  userId: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const updateChat = useMutation(updateChatMutation);
  const createSpace = useMutation(createSpaceMutation);
  const renameSpace = useMutation(renameSpaceMutation);
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
    case "new-space":
      return (
        <NameDialog
          {...common}
          title="Add space"
          description="Everyone in the workspace sees the chats in a space."
          label="Name"
          action="Add space"
          validate={spaceNameError}
          onSave={async (name) => {
            const color = SPACE_COLORS[api.spaces.length % SPACE_COLORS.length] ?? "blue";
            const id = await createSpace.mutateAsync({ workspaceId, userId, name, color });

            void navigate({ to: "/spaces/$spaceId", params: { spaceId: id } });
          }}
        />
      );
    case "rename-space":
      return (
        <NameDialog
          {...common}
          title="Rename space"
          label="Name"
          action="Rename"
          initial={dialog.space.name}
          validate={spaceNameError}
          onSave={(name) => renameSpace.mutateAsync({ workspaceId, id: dialog.space.id, name })}
        />
      );
    default:
      return null;
  }
}
