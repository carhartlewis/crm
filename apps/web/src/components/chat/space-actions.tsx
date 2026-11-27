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
}

function useSpaceMutations({ space, api, userId, workspaceId }: SpaceActionsProps) {
  const navigate = useNavigate();
  const key = pinKey("space", space.id);
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

  return {
    key,
    pinned: api.layout.pinned.includes(key),
    joined: api.joinedSpaceIds.has(space.id),
    join: () => join.mutate(membership),
    joining: join.isPending,
    leave: () => leave.mutate(membership),
    update,
    remove: () => remove.mutate({ workspaceId, id: space.id }),
  };
}

/** The pin icon on a space's row in the Spaces list (ADR 0020). */
export function SpacePinButton({ space, api }: Pick<SpaceActionsProps, "space" | "api">) {
  const key = pinKey("space", space.id);
  const pinned = api.layout.pinned.includes(key);

  return (
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
  );
}

/** Join, for the body of a space's page while you aren't a member. */
export function JoinSpaceButton(props: SpaceActionsProps) {
  const actions = useSpaceMutations(props);

  return (
    <Button size="sm" loading={actions.joining} onClick={actions.join}>
      Join space
    </Button>
  );
}

/** A space's `…` menu in its page header: Pin, Join or Leave, Edit and Delete. */
export function SpaceMenu(props: SpaceActionsProps) {
  const { space, api, userId, workspaceId } = props;
  const actions = useSpaceMutations(props);
  const [editing, setEditing] = useState(false);

  return (
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
          <DropdownMenuItem onClick={() => api.togglePin(actions.key)}>
            {actions.pinned ? "Unpin" : "Pin to the sidebar"}
          </DropdownMenuItem>
          {actions.joined ? (
            <DropdownMenuItem onClick={actions.leave}>Leave space</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={actions.join}>Join space</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setEditing(true)}>Edit…</DropdownMenuItem>
          {/* The server also lets workspace admins delete; it refuses anyone else. */}
          {space.created_by_id === userId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={actions.remove}>
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
        onSave={async (input) => {
          await actions.update.mutateAsync({ workspaceId, id: space.id, ...input });
        }}
      />
    </>
  );
}
