import add from "@carbon/icons/es/add/16.js";
import book from "@carbon/icons/es/book/16.js";
import chat from "@carbon/icons/es/chat/16.js";
import edit from "@carbon/icons/es/edit/16.js";
import grid from "@carbon/icons/es/grid/16.js";
import link from "@carbon/icons/es/link/16.js";
import plug from "@carbon/icons/es/plug/16.js";
import logout from "@carbon/icons/es/logout/16.js";
import screen from "@carbon/icons/es/screen/16.js";
import arrowsHorizontal from "@carbon/icons/es/arrows--horizontal/16.js";
import sidePanelOpen from "@carbon/icons/es/side-panel--open/16.js";
import userMultiple from "@carbon/icons/es/user--multiple/16.js";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandItemHint,
  CommandList,
  CommandMatch,
  CommandShortcut,
} from "@crm/ui/components/command";
import { carbonIcon } from "@crm/ui/components/icon";
import { useSidebar } from "@crm/ui/components/sidebar";
import { useTheme } from "@crm/ui/components/theme-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { rankSearch, type Searchable } from "@crm/ui/lib/search-rank";
import { queueFirstMessage, seedNewChat } from "../../lib/chat-api.ts";
import { useChatSpaces, useVisibleChats } from "../../lib/chat-spaces.ts";
import { startChatMutation } from "../../lib/chats.ts";
import { lastPermissionMode } from "../../lib/permission-mode.ts";
import { accessLabels, connectMutation, useConnectionHits } from "../../lib/connections.ts";
import { useCreateSheet } from "../../lib/create-sheet.ts";
import { useMemoryFacts } from "../../lib/memory-facts.ts";
import { parsePinKey } from "@crm/core/chat";
import { isPageId, pageById, pageForPath, type Page } from "../../lib/pages.ts";
import { useRecordHits } from "../../lib/record-search.ts";
import { useOpenRecord, type RecordKind } from "../../lib/records.ts";
import { usePinnedOrder } from "../../lib/pinned-order.ts";
import { sessionQuery, signOutMutation, workspacesQuery } from "../../lib/session.ts";
import { settingsGroups, type SettingsPath } from "../../lib/settings.ts";
import { pinnedShortcut, shortcutKeys, shortcuts, type Shortcut } from "../../lib/shortcuts.ts";
import { switchWorkspaceMutation } from "../../lib/workspaces.ts";
import type { FileRoutesByTo } from "../../routeTree.gen.ts";

const AddIcon = carbonIcon(add);
const FindPeopleIcon = carbonIcon(userMultiple);
const ChatIcon = carbonIcon(chat);
const KnowledgeIcon = carbonIcon(book);
const NewChatIcon = carbonIcon(edit);
const SpacesIcon = carbonIcon(grid);
const LinkIcon = carbonIcon(link);
const LogoutIcon = carbonIcon(logout);
const ConnectionIcon = carbonIcon(plug);
const ThemeIcon = carbonIcon(screen);
const SwitchIcon = carbonIcon(arrowsHorizontal);
const SidebarIcon = carbonIcon(sidePanelOpen);

/** Every page ⌘K can go to: New chat, Spaces, the pinned pages, settings, and a new workspace. */
type Listed = "/" | "/spaces" | Page["to"] | SettingsPath | "/new-workspace";

/**
 * Routes ⌘K leaves out: signed-out and first-run pages, an old URL that redirects, and single
 * chats and spaces, which need an id (⌘K finds them by search, below).
 */
type Unlisted =
  | "/sign-in"
  | "/setup-workspace"
  | "/connections"
  | "/chats/$chatId"
  | "/spaces/$spaceId";

type Fails<Missing extends never> = Missing;

/**
 * Fails type checking, naming the route, when a page is added that ⌘K neither lists nor
 * leaves out on purpose. List it (a pinned page or a settings group does that) or add it above.
 */
export type EveryRouteInPalette = Fails<Exclude<keyof FileRoutesByTo, Listed | Unlisted>>;

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly userId: string;
  readonly workspaceId: string;
}

/** Each record kind's results show under, and with the icon of, its page. */
const recordPages = {
  company: pageById("companies"),
  contact: pageById("contacts"),
  deal: pageById("deals"),
} satisfies { readonly [K in RecordKind]: Page };

/** At most this many results render while typing; the rest are a narrower query away. */
const RESULT_LIMIT = 50;

/** Facts are sentences that match many queries: at most this many show among the results. */
const FACT_RESULTS = 8;

/** One row of ⌘K. `id` is unique and is cmdk's value for it. */
interface PaletteCommand extends Searchable {
  readonly id: string;
  readonly icon: ComponentType;
  readonly shortcut?: Shortcut;
  /** The active workspace: shown checked, and not selectable. */
  readonly current?: boolean;
  readonly run: () => void;
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy the link");
  }
}

function Keys({ shortcut }: { shortcut: Shortcut | undefined }) {
  return shortcut ? <CommandShortcut>{shortcutKeys(shortcut).join("")}</CommandShortcut> : null;
}

/** The sections in the order they show, each with its commands in order. */
function bySection(commands: readonly PaletteCommand[]) {
  const sections = new Map<string, PaletteCommand[]>();

  for (const command of commands) {
    sections.set(command.section, [...(sections.get(command.section) ?? []), command]);
  }

  return [...sections];
}

/**
 * ⌘K. Its chunk is preloaded when the shell is idle, so the keyboard opens it at once (and,
 * being keyboard-initiated, without animation). Workspaces come from the cache the route guards
 * filled and refresh every 30 s while it's open. The current page's commands come first.
 */
export default function CommandPalette({
  open,
  onOpenChange,
  userId,
  workspaceId,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { setTheme } = useTheme();
  const [, setCreate] = useCreateSheet();
  // The same numbering as ⌥1–⌥9: Pinned's pages and chats, not pinned spaces.
  const order = usePinnedOrder(userId).filter((key) => !key.startsWith("space:"));
  const current = useRouterState({ select: (state) => pageForPath(state.location.pathname) });
  const { data: session } = useQuery(sessionQuery);

  const { data: workspaces = [] } = useQuery({
    ...workspacesQuery(userId),
    refetchInterval: open ? 30_000 : false,
  });

  const switchWorkspace = useMutation({
    ...switchWorkspaceMutation,
    onError: (error) => toast.error(error.message),
  });

  const signOut = useMutation({
    ...signOutMutation,
    onError: (error) => toast.error(error.message),
  });

  const activeId = session?.session.activeOrganizationId;
  const openRecord = useOpenRecord();

  const hits = useRecordHits(workspaceId);

  const companyNames = new Map(
    hits.filter((hit) => hit.kind === "company").map((hit) => [hit.id, hit.label]),
  );

  // Records are searched, never listed: a workspace can hold thousands.
  const records: PaletteCommand[] = hits.map((hit) => ({
    id: `${hit.kind}:${hit.id}`,
    label: hit.label,
    section: recordPages[hit.kind].label,
    keywords: hit.keywords,
    icon: recordPages[hit.kind].icon,
    run: () => void openRecord(hit.kind, hit.id),
  }));

  // Copied memory facts (ADR 0017). A company's fact opens its Knowledge tab; the workspace's
  // own facts open Workspace Memory.
  const facts: PaletteCommand[] = useMemoryFacts(workspaceId).map((fact) => {
    const companyId = fact.company_id;
    const company = companyId ? companyNames.get(companyId) : undefined;

    return {
      id: `fact:${fact.id}`,
      label: fact.text,
      section: `Knowledge · ${company ?? "Workspace"}`,
      keywords: company ? [company] : [],
      icon: KnowledgeIcon,
      run: companyId
        ? () => void openRecord("company", companyId, "knowledge")
        : () => void navigate({ to: "/settings/memory" }),
    };
  });

  // Spaces (ADR 0020), searched by name and description while typing; Enter opens the space.
  const chatSpaces = useChatSpaces(workspaceId);
  const spaceNames = new Map(chatSpaces.map((space) => [space.id, space.name]));

  const spaces: PaletteCommand[] = chatSpaces.map((space) => ({
    id: `space:${space.id}`,
    label: space.name,
    section: "Spaces",
    keywords: space.description ? [space.description] : [],
    icon: SpacesIcon,
    run: () => void navigate({ to: "/spaces/$spaceId", params: { spaceId: space.id } }),
  }));

  // Chats you can see (your own and your spaces'), searched by title while typing, newest first
  // on a tie; a chat's space name finds it too. Enter opens the chat.
  const chats: PaletteCommand[] = useVisibleChats(workspaceId).map((item) => {
    const space = item.space_id ? spaceNames.get(item.space_id) : undefined;

    return {
      id: `chat:${item.id}`,
      label: item.title,
      section: "Chats",
      keywords: space ? [space] : [],
      icon: ChatIcon,
      run: () => void navigate({ to: "/chats/$chatId", params: { chatId: item.id } }),
    };
  });

  // Apps (ADR 0013), connected or not, searched by name, vendor, domain and summary while
  // typing. The app's row opens Connections filtered to it; an app not connected also has a row
  // per access level that starts its sign-in at once.
  const connect = useMutation({
    ...connectMutation,
    onError: (error) => toast.error(error.message),
  });

  const connections: PaletteCommand[] = useConnectionHits(workspaceId).flatMap((app) => {
    const keywords = [app.name].concat(app.keywords);

    const page: PaletteCommand = {
      id: `connection:${app.id}`,
      label: app.name,
      section: app.connected ? "Connected" : "Connections",
      keywords,
      icon: ConnectionIcon,
      run: () => void navigate({ href: app.href }),
    };

    if (app.connected) return [page];

    return [page].concat(
      (["read", "write"] as const).map((access) => ({
        id: `connect:${app.id}:${access}`,
        label: `Connect ${app.name} (${accessLabels[access].toLowerCase()})`,
        section: "Connections",
        keywords: ["install", "add"].concat(keywords),
        icon: AddIcon,
        run: () => connect.mutate({ integration: app.id, access }),
      })),
    );
  });

  const commands: PaletteCommand[] = [
    ...(current
      ? [
          {
            id: "copy-link",
            label: `Copy link to ${current.label}`,
            section: current.label,
            icon: LinkIcon,
            run: () => void copyLink(),
          },
        ]
      : []),
    {
      id: "go:/",
      label: "New chat",
      section: "Go to",
      keywords: ["home", "assistant", "ask"],
      icon: NewChatIcon,
      shortcut: shortcuts.newChat,
      run: () => void navigate({ to: "/" }),
    },
    {
      id: "go:/spaces",
      label: "Spaces",
      section: "Go to",
      keywords: ["teams", "shared", "join"],
      icon: SpacesIcon,
      run: () => void navigate({ to: "/spaces" }),
    },
    {
      id: "create:space",
      label: "New space",
      section: "Go to",
      keywords: ["create", "add", "team"],
      icon: SpacesIcon,
      run: () => void setCreate("space"),
    },
    {
      id: "create:company",
      label: "New company",
      section: "Go to",
      keywords: ["create", "add", "account", "organisation"],
      icon: AddIcon,
      shortcut: shortcuts.newCompany,
      run: () => void setCreate("company"),
    },
    {
      id: "create:contact",
      label: "New contact",
      section: "Go to",
      keywords: ["create", "add", "person", "people"],
      icon: AddIcon,
      shortcut: shortcuts.newContact,
      run: () => void setCreate("contact"),
    },
    {
      id: "create:deal",
      label: "New deal",
      section: "Go to",
      keywords: ["create", "add", "opportunity", "pipeline"],
      icon: AddIcon,
      shortcut: shortcuts.newDeal,
      run: () => void setCreate("deal"),
    },
    // Pinned chats and spaces are in the sidebar; ⌘K lists the pages, with their pinned shortcut.
    ...order.flatMap((key, index) => {
      const pin = parsePinKey(key);

      if (pin?.kind !== "page" || !isPageId(pin.id)) return [];

      const page = pageById(pin.id);

      return {
        id: `go:${page.to}`,
        label: page.label,
        section: "Go to",
        keywords: [page.description],
        icon: page.icon,
        shortcut: pinnedShortcut(index),
        run: () => void navigate({ to: page.to }),
      };
    }),
    ...settingsGroups.flatMap((group) =>
      group.pages.map((page) => ({
        id: `go:${page.to}`,
        label: page.label,
        section: `${group.label} settings`,
        keywords: ["preferences"],
        icon: page.icon,
        run: () => void navigate({ to: page.to }),
      })),
    ),
    ...(workspaces.length > 1
      ? workspaces.map((workspace) => ({
          id: `workspace:${workspace.id}`,
          label: `Switch to ${workspace.name}`,
          section: "Workspaces",
          icon: SwitchIcon,
          current: workspace.id === activeId,
          run: () => switchWorkspace.mutate(workspace.id),
        }))
      : []),
    {
      id: "go:/new-workspace",
      label: "Create a workspace",
      section: "Workspaces",
      keywords: ["new"],
      icon: AddIcon,
      run: () => void navigate({ to: "/new-workspace" }),
    },
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      section: "Actions",
      icon: SidebarIcon,
      shortcut: shortcuts.sidebar,
      run: toggleSidebar,
    },
    ...(["light", "dark", "system"] as const).map((theme) => ({
      id: `theme:${theme}`,
      label: `Use ${theme} theme`,
      section: "Actions",
      keywords: ["appearance", "mode"],
      icon: ThemeIcon,
      run: () => setTheme(theme),
    })),
    {
      id: "log-out",
      label: "Log out",
      section: "Actions",
      keywords: ["sign out"],
      icon: LogoutIcon,
      run: () => signOut.mutate(),
    },
  ];

  const select = (command: PaletteCommand) => () => {
    onOpenChange(false);
    command.run();
  };

  // "Find people: …" starts a chat that searches for them (ADR 0027).
  const queryClient = useQueryClient();

  const findPeople = useMutation({
    ...startChatMutation,
    onSuccess: ({ id, sessionId }, { text }) => {
      seedNewChat(queryClient, userId, id, sessionId);
      queueFirstMessage(id, { text, files: [] });
      void navigate({ to: "/chats/$chatId", params: { chatId: id } });
    },
    onError: (error) => toast.error(error.message),
  });

  const askFindPeople = (query: string) => () => {
    onOpenChange(false);
    findPeople.mutate({
      workspaceId,
      userId,
      text: `Find people: ${query}`,
      spaceId: null,
      permissionMode: lastPermissionMode(userId),
    });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search records, pages and commands"
    >
      <PaletteSearch
        commands={commands}
        records={[...records, ...chats, ...spaces, ...connections, ...facts]}
        select={select}
        findPeople={askFindPeople}
        placeholder={
          current ? `Search ${current.label.toLowerCase()} and commands…` : "Search or jump to…"
        }
      />
    </CommandDialog>
  );
}

/**
 * The search box and results. Mounted only while the palette is open, so it opens empty. With
 * no query, commands show under their sections; with one, commands and records show best match
 * first (`rankSearch`), each with its section, so cmdk's own filter is off.
 */
function PaletteSearch({
  commands,
  records,
  select,
  findPeople,
  placeholder,
}: {
  commands: readonly PaletteCommand[];
  records: readonly PaletteCommand[];
  select: (command: PaletteCommand) => () => void;
  /** Starts a chat that finds people matching the query. */
  findPeople: (query: string) => () => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const ranked = rankSearch([...commands, ...records], query);
  const isFact = (command: PaletteCommand) => command.id.startsWith("fact:");

  const shownFacts = new Set(
    ranked
      .filter(({ item }) => isFact(item))
      .slice(0, FACT_RESULTS)
      .map(({ item }) => item.id),
  );

  const results = ranked
    .filter(({ item }) => !isFact(item) || shownFacts.has(item.id))
    .slice(0, RESULT_LIMIT);

  const row = (command: PaletteCommand, ranges: readonly number[] | null, hint: boolean) => {
    const Icon = command.icon;

    return (
      <CommandItem
        key={command.id}
        value={command.id}
        data-checked={command.current}
        disabled={command.current}
        onSelect={select(command)}
      >
        <Icon />
        <CommandMatch text={command.label} ranges={ranges} />
        {hint ? <CommandItemHint>{command.section}</CommandItemHint> : null}
        <Keys shortcut={command.shortcut} />
      </CommandItem>
    );
  };

  return (
    <Command loop shouldFilter={false}>
      <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        {query.trim() === "" ? (
          bySection(commands).map(([section, items]) => (
            <CommandGroup key={section} heading={section}>
              {items.map((command) => row(command, null, false))}
            </CommandGroup>
          ))
        ) : (
          <CommandGroup>
            {results.map(({ item, ranges }) => row(item, ranges, true))}
            {/* After the matches: the query as a people search, so typing a brief finds people. */}
            <CommandItem value="find-people" onSelect={findPeople(query.trim())}>
              <FindPeopleIcon />
              <span className="min-w-0 truncate">Find people: “{query.trim()}”</span>
              <CommandItemHint>Chat</CommandItemHint>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
