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
  CommandList,
  CommandShortcut,
} from "@crm/ui/components/command";
import { carbonIcon } from "@crm/ui/components/icon";
import { useSidebar } from "@crm/ui/components/sidebar";
import { useTheme } from "@crm/ui/components/theme-provider";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
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

  const run = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search pages and commands"
    >
      <Command loop>
        <CommandInput
          placeholder={
            current ? `Search ${current.label.toLowerCase()} and commands…` : "Search or jump to…"
          }
        />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
          {current && (
            <CommandGroup heading={current.label}>
              <CommandItem
                value={`copy link ${current.label}`}
                onSelect={run(() => void copyLink())}
              >
                <LinkIcon />
                {`Copy link to ${current.label}`}
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Go to">
            <CommandItem value="home" onSelect={run(() => void navigate({ to: "/" }))}>
              <HomeIcon />
              Home
              <Keys shortcut={shortcuts.home} />
            </CommandItem>
            {order.map((id, index) => {
              const page = pageById(id);
              const PageIcon = page.icon;

              return (
                <CommandItem
                  key={id}
                  value={page.label}
                  keywords={[page.description]}
                  onSelect={run(() => void navigate({ to: page.to }))}
                >
                  <PageIcon />
                  {page.label}
                  <Keys shortcut={pinnedShortcut(index)} />
                </CommandItem>
              );
            })}
          </CommandGroup>
          {settingsGroups.map((group) => (
            <CommandGroup key={group.label} heading={`${group.label} settings`}>
              {group.pages.map((page) => {
                const PageIcon = page.icon;

                return (
                  <CommandItem
                    key={page.to}
                    value={`${group.label} settings ${page.label}`}
                    keywords={["settings", "preferences"]}
                    onSelect={run(() => void navigate({ to: page.to }))}
                  >
                    <PageIcon />
                    {page.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          <CommandGroup heading="Workspaces">
            {workspaces.length > 1 &&
              workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  value={`workspace ${workspace.name}`}
                  data-checked={workspace.id === activeId}
                  disabled={workspace.id === activeId}
                  onSelect={run(() => switchWorkspace.mutate(workspace.id))}
                >
                  <SwitchIcon />
                  {`Switch to ${workspace.name}`}
                </CommandItem>
              ))}
            <CommandItem
              value="create a new workspace"
              onSelect={run(() => void navigate({ to: "/new-workspace" }))}
            >
              <AddIcon />
              Create a workspace
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem value="toggle sidebar" onSelect={run(toggleSidebar)}>
              <SidebarIcon />
              Toggle sidebar
              <Keys shortcut={shortcuts.sidebar} />
            </CommandItem>
            {(["light", "dark", "system"] as const).map((theme) => (
              <CommandItem
                key={theme}
                value={`theme ${theme}`}
                onSelect={run(() => setTheme(theme))}
              >
                <ThemeIcon />
                {`Use ${theme} theme`}
              </CommandItem>
            ))}
            <CommandItem value="log out sign out" onSelect={run(() => signOut.mutate())}>
              <LogoutIcon />
              Log out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
