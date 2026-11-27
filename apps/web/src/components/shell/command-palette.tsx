import add from "@carbon/icons/es/add/16.js";
import home from "@carbon/icons/es/home/16.js";
import link from "@carbon/icons/es/link/16.js";
import logout from "@carbon/icons/es/logout/16.js";
import screen from "@carbon/icons/es/screen/16.js";
import arrowsHorizontal from "@carbon/icons/es/arrows--horizontal/16.js";
import sidePanelOpen from "@carbon/icons/es/side-panel--open/16.js";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { rankCommands, type Searchable } from "../../lib/command-search.ts";
import { pageById, pageForPath, type Page } from "../../lib/pages.ts";
import { usePinnedOrder } from "../../lib/pinned-order.ts";
import { sessionQuery, signOutMutation, workspacesQuery } from "../../lib/session.ts";
import { settingsGroups, type SettingsPath } from "../../lib/settings.ts";
import { pinnedShortcut, shortcutKeys, shortcuts, type Shortcut } from "../../lib/shortcuts.ts";
import { switchWorkspaceMutation } from "../../lib/workspaces.ts";
import type { FileRoutesByTo } from "../../routeTree.gen.ts";

const AddIcon = carbonIcon(add);
const HomeIcon = carbonIcon(home);
const LinkIcon = carbonIcon(link);
const LogoutIcon = carbonIcon(logout);
const ThemeIcon = carbonIcon(screen);
const SwitchIcon = carbonIcon(arrowsHorizontal);
const SidebarIcon = carbonIcon(sidePanelOpen);

/** Every page ⌘K can go to: Home, the pinned pages, settings, and a new workspace. */
type Listed = "/" | Page["to"] | SettingsPath | "/new-workspace";

/** Routes ⌘K leaves out: signed-out and first-run pages, and an old URL that redirects. */
type Unlisted = "/sign-in" | "/setup-workspace" | "/connections";

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
}

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
export default function CommandPalette({ open, onOpenChange, userId }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { setTheme } = useTheme();
  const order = usePinnedOrder(userId);
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
      label: "Home",
      section: "Go to",
      icon: HomeIcon,
      shortcut: shortcuts.home,
      run: () => void navigate({ to: "/" }),
    },
    ...order.map((id, index) => {
      const page = pageById(id);

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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search pages and commands"
    >
      <PaletteSearch
        commands={commands}
        select={select}
        placeholder={
          current ? `Search ${current.label.toLowerCase()} and commands…` : "Search or jump to…"
        }
      />
    </CommandDialog>
  );
}

/**
 * The search box and results. Mounted only while the palette is open, so it opens empty. With
 * no query, commands show under their sections; with one, they show best match first
 * (`rankCommands`), each with its section, so cmdk's own filter is off.
 */
function PaletteSearch({
  commands,
  select,
  placeholder,
}: {
  commands: readonly PaletteCommand[];
  select: (command: PaletteCommand) => () => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const results = rankCommands(commands, query);

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
          <CommandGroup>{results.map(({ item, ranges }) => row(item, ranges, true))}</CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
