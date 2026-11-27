import add from "@carbon/icons/es/add/16.js";
import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import folderIcon from "@carbon/icons/es/folder/16.js";
import logout from "@carbon/icons/es/logout/16.js";
import pinGlyph from "@carbon/icons/es/pin/16.js";
import pinFilled from "@carbon/icons/es/pin--filled/16.js";
import { chatTitleError, folderNameError, parsePinKey, type PinKind, pinKey } from "@crm/core/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@crm/ui/components/sidebar";
import { SpaceDot } from "@crm/ui/components/space-dot";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  type Chat,
  type ChatSpace,
  leaveSpaceMutation,
  updateChatMutation,
} from "../../lib/chats.ts";
import { haptic } from "../../lib/haptics.ts";
import { useShownPathname } from "../../lib/shown-path.ts";
import { isPageId, pageById, pageForPath } from "../../lib/pages.ts";
import { ariaKeyShortcuts, pinnedShortcut } from "../../lib/shortcuts.ts";
import { folderOf, moveToFolder, pinAt, recentChats } from "../../lib/sidebar-layout.ts";
import { type ChatMenuRequest, MenuIcon, spaceColor } from "../chat/chat-menu.tsx";
import { NameDialog } from "../chat/name-dialog.tsx";
import { type ChatsApi, editLayoutAt, reorderPinnedAt, useChats } from "../chat/use-chats.ts";
import type { SidebarSection } from "../../lib/sidebar-sections.ts";
import { NavLink } from "./nav-link.tsx";
import { NavSection } from "./nav-section.tsx";
import { chatDragDrop } from "./chat-drag.ts";
import { reorderable } from "./reorder.ts";

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
  const pathname = useShownPathname();

  const rowProps = { api, userId, workspaceId, pathname, onRequest: setDialog };

  const moveChat = useMutation({
    ...updateChatMutation,
    onError: (error) => toast.error(error.message),
  }).mutate;

  // Drag a chat from Recents or a folder onto Pinned, a folder or a joined space, a haptic tick
  // per target. Edits read the current layout at the drop, so this callback stays stable.
  const dragRef = useCallback(
    (root: HTMLDivElement | null) =>
      chatDragDrop({
        onTargetChange: haptic,
        onDrop: (chatId, drop) => {
          if (drop.kind === "space") {
            moveChat({ workspaceId, id: chatId, spaceId: drop.id });

            return;
          }

          editLayoutAt(workspaceId, userId, (layout) => {
            if (drop.kind === "pinned") {
              return {
                ...layout,
                pinned: pinAt(layout.pinned, pinKey("chat", chatId), drop.index),
              };
            }

            if (drop.kind === "folder") {
              return { ...layout, folders: moveToFolder(layout.folders, chatId, drop.id) };
            }

            // Into Recents at a place: out of any folder, and the shown order saved.
            return {
              ...layout,
              folders: moveToFolder(layout.folders, chatId, null),
              recent: [...drop.order],
            };
          });
        },
      })(root),
    [workspaceId, userId, moveChat],
  );

  // ⌥1–⌥9 run through Pinned's pages, then on through the pinned chats.
  const pinnedPages = api.layout.pinned.filter((key) => {
    const pin = parsePinKey(key);

    return pin?.kind === "page" && isPageId(pin.id);
  }).length;

  const pinnedChats = api.layout.pinned.some((key) => {
    const pin = parsePinKey(key);

    return pin?.kind === "chat" && api.chatById(pin.id) !== undefined;
  });

  return (
    <div ref={dragRef}>
      {/* With no pinned chats yet, Pinned takes the first one dropped. */}
      <PinGroup
        label="Pinned"
        section="pinned"
        collapsible={false}
        kinds={["page"]}
        hotkeyOffset={0}
        takesChats={!pinnedChats}
        {...rowProps}
      />
      <PinGroup label="Spaces" section="spaces" kinds={["space"]} {...rowProps} />
      <PinGroup
        label="Pinned chats"
        section="pinned-chats"
        kinds={["chat"]}
        hotkeyOffset={pinnedPages}
        takesChats
        {...rowProps}
      />
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

interface PinGroupProps extends RowProps {
  readonly label: string;
  readonly section: SidebarSection;
  /** False keeps the section always open (Pinned's pages). */
  readonly collapsible?: boolean;
  /** Which pins this group shows: pages in Pinned, spaces in Spaces, chats in Pinned chats. */
  readonly kinds: readonly PinKind[];
  /** The ⌥ number before this group's first row; no hotkeys when absent. */
  readonly hotkeyOffset?: number;
  /** Chats dragged from Recents or a folder can be dropped between its rows. */
  readonly takesChats?: boolean;
}

/**
 * A group of pins in the user's one pinned order: Pinned (pages), Spaces (pinned spaces) or
 * Pinned chats. Drag to reorder within the group, a haptic tick per slot; ⌥1–⌥9 open the first
 * nine of Pinned and Pinned chats.
 */
function PinGroup({
  label,
  section,
  collapsible,
  kinds,
  hotkeyOffset,
  takesChats = false,
  api,
  userId,
  workspaceId,
  pathname,
  onRequest,
}: PinGroupProps) {
  const shown = new Set(kinds);

  // Pins whose chat or space is gone (deleted, or not synced yet) are skipped, not shown empty.
  const visible = api.layout.pinned.flatMap((key, index) => {
    const entry = parsePinKey(key);

    if (!entry || !shown.has(entry.kind)) return [];

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

  if (visible.length === 0) return null;

  return (
    <NavSection userId={userId} section={section} label={label} collapsible={collapsible}>
      {/* Chats dropped between its rows are pinned there (chat-drag.ts). */}
      <SidebarMenu ref={listRef} aria-label={label} data-drop-pinned={takesChats || undefined}>
        {visible.map(({ key, index: pinIndex, pin: item }, index) => {
          const shortcutIndex = hotkeyOffset === undefined ? undefined : hotkeyOffset + index;
          const shortcut = shortcutIndex === undefined ? undefined : pinnedShortcut(shortcutIndex);

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
                shortcutIndex={shortcutIndex}
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
              shortcutIndex={shortcutIndex}
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
    </NavSection>
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
    <NavSection
      userId={userId}
      section="folders"
      label="Folders"
      action={
        <SidebarGroupAction
          aria-label="New folder"
          onClick={() => onRequest({ kind: "new-folder-empty" })}
        >
          <AddIcon />
        </SidebarGroupAction>
      }
    >
      <SidebarMenu aria-label="Folders">
        {api.layout.folders.map((folder) => {
          const open = !closed.has(folder.id);

          // A pinned chat shows once, in Pinned.
          const chats = folder.chatIds.flatMap((id) =>
            pinned.has(pinKey("chat", id)) ? [] : (api.chatById(id) ?? []),
          );

          return (
            <SidebarMenuItem key={folder.id} data-drop-folder={folder.id}>
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
    </NavSection>
  );
}

function RecentsGroup({ api, userId, workspaceId, pathname, onRequest }: RowProps) {
  const recents = recentChats(api.chats, api.layout, userId, api.joinedSpaceIds);

  if (recents.length === 0) return null;

  return (
    <NavSection userId={userId} section="recents" label="Recents">
      {/* Drag to reorder; the order saves on the synced sidebar row (chat-drag.ts). */}
      <SidebarMenu aria-label="Recents" data-drop-recents>
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
    </NavSection>
  );
}

interface ChatRowProps extends RowProps {
  readonly chat: Chat;
  readonly shortcutIndex?: number;
  /** Its place in the Pinned order, when it is a pinned row (drag to reorder). */
  readonly pinIndex?: number;
}

/** A chat in the sidebar. Hovering preloads its route, so its history is fetched before the click. */
function ChatRow({ chat, shortcutIndex, pinIndex, ...props }: ChatRowProps) {
  const shortcut = shortcutIndex === undefined ? undefined : pinnedShortcut(shortcutIndex);
  const key = pinKey("chat", chat.id);
  const pinned = props.api.layout.pinned.includes(key);
  // An unpinned chat drags onto Pinned, a folder or a space (chat-drag.ts); a pinned one reorders.
  const draggable = pinIndex === undefined;

  return (
    <SidebarMenuItem
      data-reorder-item={draggable ? undefined : true}
      data-pin-index={pinIndex}
      data-drag-chat={draggable ? chat.id : undefined}
      data-chat-space={draggable ? (chat.space_id ?? "") : undefined}
      data-chat-folder={
        draggable ? (folderOf(props.api.layout.folders, chat.id)?.id ?? "") : undefined
      }
    >
      <SidebarMenuButton
        isActive={props.pathname === `/chats/${chat.id}`}
        aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
        render={
          <Link
            to="/chats/$chatId"
            params={{ chatId: chat.id }}
            draggable={false}
            viewTransition={false}
          />
        }
      >
        {/* One line: the hover icons take the end of the row, so the hotkey isn't shown here. */}
        <span className="min-w-0 flex-1 truncate">{chat.title}</span>
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
  // A joined space takes chats dropped on it (chat-drag.ts).
  return (
    <SidebarMenuItem
      data-reorder-item={pinIndex === undefined ? undefined : true}
      data-pin-index={pinIndex}
      data-drop-space={joined ? space.id : undefined}
    >
      <SidebarMenuButton
        isActive={props.pathname === `/spaces/${space.id}`}
        aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
        render={
          <Link
            to="/spaces/$spaceId"
            params={{ spaceId: space.id }}
            draggable={false}
            viewTransition={false}
          />
        }
      >
        <SpaceDot color={spaceColor(space.color)} />
        <span className="min-w-0 flex-1 truncate">{space.name}</span>
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
