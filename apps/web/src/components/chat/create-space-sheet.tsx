import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { createSpaceMutation } from "../../lib/chats.ts";
import { SpaceSheet } from "./space-sheet.tsx";

export interface CreateSpaceSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly userId: string;
  readonly workspaceId: string;
}

/** New space (`?create=space`), from the Spaces page or ⌘K. Its own chunk, mounted in the shell. */
export default function CreateSpaceSheet({
  open,
  onOpenChange,
  userId,
  workspaceId,
}: CreateSpaceSheetProps) {
  const navigate = useNavigate();

  const create = useMutation({
    ...createSpaceMutation,
    onSuccess: (spaceId) => {
      void navigate({ to: "/spaces/$spaceId", params: { spaceId } });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <SpaceSheet
      open={open}
      onOpenChange={onOpenChange}
      onSave={async (input) => {
        await create.mutateAsync({ workspaceId, userId, ...input });
      }}
    />
  );
}
