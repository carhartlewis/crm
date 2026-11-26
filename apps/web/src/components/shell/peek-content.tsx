import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@crm/ui/components/avatar";
import { Kbd, KbdGroup } from "@crm/ui/components/kbd";
import { Separator } from "@crm/ui/components/separator";
import { useSuspenseQuery } from "@tanstack/react-query";
import { initials } from "../../lib/initials.ts";
import type { Page } from "../../lib/pages.ts";
import { workspaceQuery } from "../../lib/session.ts";
import { shortcutKeys, type Shortcut } from "../../lib/shortcuts.ts";

export interface PeekContentProps {
  readonly page: Page;
  readonly shortcut: Shortcut | undefined;
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * What a pinned page holds, at a glance. Its own chunk, warmed with the workspace data on hover
 * (see NavLink), so it opens with everything in place. Record counts join this once records
 * sync to the client.
 */
export default function PeekContent({ page, shortcut, userId, workspaceId }: PeekContentProps) {
  const { data: workspace } = useSuspenseQuery(workspaceQuery(userId, workspaceId));
  const members = workspace.members;
  const PageIcon = page.icon;

  return (
    <>
      <div className="flex items-center gap-2">
        <PageIcon className="text-muted-foreground" />
        <span className="font-medium">{page.label}</span>
        {shortcut && (
          <KbdGroup className="ml-auto">
            {shortcutKeys(shortcut).map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </div>
      <p className="text-muted-foreground">{page.description}</p>
      <Separator />
      <div className="flex items-center gap-2">
        <AvatarGroup>
          {members.slice(0, 4).map((member) => (
            <Avatar key={member.id} size="sm">
              {member.user.image && <AvatarImage src={member.user.image} alt="" />}
              <AvatarFallback>{initials(member.user.name)}</AvatarFallback>
            </Avatar>
          ))}
        </AvatarGroup>
        <span className="ml-auto text-xs text-muted-foreground">
          {`${workspace.name} · ${members.length} ${members.length === 1 ? "member" : "members"}`}
        </span>
      </div>
    </>
  );
}
