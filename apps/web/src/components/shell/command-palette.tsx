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
import { pageById, pageForPath } from "../../lib/pages.ts";
import { usePinnedOrder } from "../../lib/pinned-order.ts";
import { sessionQuery, signOutMutation, workspacesQuery } from "../../lib/session.ts";
import { pinnedShortcut, shortcutKeys, shortcuts, type Shortcut } from "../../lib/shortcuts.ts";
import { switchWorkspaceMutation } from "../../lib/workspaces.ts";

const HomeIcon = carbonIcon(home);
const LinkIcon = carbonIcon(link);
const LogoutIcon = carbonIcon(logout);
const ThemeIcon = carbonIcon(screen);
const SwitchIcon = carbonIcon(arrowsHorizontal);
const SidebarIcon = carbonIcon(sidePanelOpen);

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
          {workspaces.length > 1 && (
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => (
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
            </CommandGroup>
          )}
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
