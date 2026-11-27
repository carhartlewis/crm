import overflowMenuHorizontal from "@carbon/icons/es/overflow-menu--horizontal/16.js";
import pinGlyph from "@carbon/icons/es/pin/16.js";
import pinFilled from "@carbon/icons/es/pin--filled/16.js";
import { isSpaceColor, pinKey } from "@crm/core/chat";
import { Button } from "@crm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  type ChatSpace,
  deleteSpaceMutation,
  joinSpaceMutation,
  leaveSpaceMutation,
  updateSpaceMutation,
} from "../../lib/chats.ts";
import { SpaceSheet } from "./space-sheet.tsx";
import type { ChatsApi } from "./use-chats.ts";

const PinIcon = carbonIcon(pinGlyph);
const PinnedIcon = carbonIcon(pinFilled);
const MenuIcon = carbonIcon(overflowMenuHorizontal);

export interface SpaceActionsProps {
  readonly space: ChatSpace;
  readonly api: ChatsApi;
  readonly userId: string;
  readonly workspaceId: string;
  /** The space's own page also offers Edit and Delete. */
  readonly full?: boolean;
}

/** Pin, Join or Leave, and (on the space's page) Edit and Delete (ADR 0020). */
export function SpaceActions({ space, api, userId, workspaceId, full = false }: SpaceActionsProps) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const key = pinKey("space", space.id);
  const pinned = api.layout.pinned.includes(key);
  const joined = api.joinedSpaceIds.has(space.id);
  const membership = { workspaceId, userId, spaceId: space.id };

  const join = useMutation({
    ...joinSpaceMutation,
    onError: (error) => toast.error(error.message),
  });

  const leave = useMutation({
    ...leaveSpaceMutation,
    // A space you left no longer needs its pin.
    onSuccess: () => {
      if (api.layout.pinned.includes(key)) api.togglePin(key);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    ...updateSpaceMutation,
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    ...deleteSpaceMutation,
    onSuccess: () => {
      if (api.layout.pinned.includes(key)) api.togglePin(key);

      void navigate({ to: "/spaces" });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={pinned ? `Unpin ${space.name}` : `Pin ${space.name}`}
              aria-pressed={pinned}
              onClick={() => api.togglePin(key)}
            >
              {pinned ? <PinnedIcon /> : <PinIcon />}
            </Button>
          }
        />
        <TooltipContent>{pinned ? "Unpin" : "Pin to the sidebar"}</TooltipContent>
      </Tooltip>
      {joined ? (
        <Button
          variant="outline"
          size="sm"
          loading={leave.isPending}
          onClick={() => leave.mutate(membership)}
        >
          Leave
        </Button>
      ) : (
        <Button size="sm" loading={join.isPending} onClick={() => join.mutate(membership)}>
          Join
        </Button>
      )}
      {full && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`${space.name} options`}>
                  <MenuIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>Edit…</DropdownMenuItem>
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
          <SpaceSheet
            open={editing}
            onOpenChange={setEditing}
            initial={{
              name: space.name,
              description: space.description,
              color: isSpaceColor(space.color) ? space.color : "blue",
            }}
            onSave={(input) => update.mutateAsync({ workspaceId, id: space.id, ...input })}
          />
        </>
      )}
    </div>
  );
}
