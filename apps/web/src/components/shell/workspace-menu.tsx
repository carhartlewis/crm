import arrowsHorizontal from "@carbon/icons/es/arrows--horizontal/16.js";
import chevronDown from "@carbon/icons/es/chevron--down/16.js";
import logout from "@carbon/icons/es/logout/16.js";
import screen from "@carbon/icons/es/screen/16.js";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@crm/ui/components/sidebar";
import { useTheme } from "@crm/ui/components/theme-provider";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { initials } from "../../lib/initials.ts";
import { sessionQuery, signOutMutation, workspacesQuery } from "../../lib/session.ts";
import { switchWorkspaceMutation } from "../../lib/workspaces.ts";

const SwitchIcon = carbonIcon(arrowsHorizontal);
const ChevronDownIcon = carbonIcon(chevronDown);
const LogoutIcon = carbonIcon(logout);
const ThemeIcon = carbonIcon(screen);

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

/** The sidebar footer: who you are, which workspace you're in, and the way out. */
export function WorkspaceMenu({ userId }: { userId: string }) {
  const { data: session } = useSuspenseQuery(sessionQuery);
  const { data: workspaces } = useSuspenseQuery(workspacesQuery(userId));
  const { theme, setTheme } = useTheme();
  const activeId = session?.session.activeOrganizationId;
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];
  const user = session?.user;

  const switchWorkspace = useMutation({
    ...switchWorkspaceMutation,
    onError: (error) => toast.error(error.message),
  });

  const signOut = useMutation({
    ...signOutMutation,
    onError: (error) => toast.error(error.message),
  });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton />}>
            <Avatar size="sm">
              <AvatarFallback>{initials(active?.name ?? "")}</AvatarFallback>
            </Avatar>
            <span>{active?.name}</span>
            <ChevronDownIcon className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <span className="flex items-center gap-2 py-1">
                  <Avatar>
                    {user?.image && <AvatarImage src={user.image} alt="" />}
                    <AvatarFallback>{initials(user?.name ?? "")}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-foreground">{user?.name}</span>
                    <span className="truncate">{user?.email}</span>
                  </span>
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <SwitchIcon />
                  Switch workspace
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={active?.id}
                    onValueChange={(id: string) => {
                      if (id !== active?.id) switchWorkspace.mutate(id);
                    }}
                  >
                    {workspaces.map((workspace) => (
                      <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ThemeIcon />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    {THEMES.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem
                variant="destructive"
                closeOnClick={false}
                disabled={signOut.isPending || signOut.isSuccess}
                onClick={() => signOut.mutate()}
              >
                <LogoutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
