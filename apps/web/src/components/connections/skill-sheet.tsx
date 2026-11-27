import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Markdown } from "@crm/ui/components/markdown";
import { Separator } from "@crm/ui/components/separator";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { FormattedDate } from "@crm/ui/patterns/formatted-date";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { removeSkillMutation, setSkillEnabledMutation, skillQuery } from "../../lib/skills.ts";

const onError = (error: Error) => toast.error(error.message);

/** `owner/repo/skill` → `owner/repo`; the skill's own name is already the title. */
function sourceOf(sourceId: string) {
  return sourceId.split("/").slice(0, -1).join("/");
}

/**
 * One skill, to read before enabling it: what it is for, where it came from, and its
 * instructions as rendered Markdown. Loaded on demand (the renderer is WebAssembly).
 */
export default function SkillSheet({
  userId,
  workspaceId,
  id,
  onClose,
}: {
  userId: string;
  workspaceId: string;
  id: string;
  onClose: () => void;
}) {
  const skill = useQuery(skillQuery(userId, workspaceId, id));
  const setEnabled = useMutation({ ...setSkillEnabledMutation, onError });

  const remove = useMutation({
    ...removeSkillMutation,
    onError,
    onSuccess: () => {
      toast("The skill is removed for everyone.");
      onClose();
    },
  });

  const detail = skill.data;
  const files = detail?.files.length ?? 0;

  return (
    <AdaptiveSheet open onOpenChange={(open) => (open ? undefined : onClose())} size="wide">
      <AdaptiveSheetContent>
        <AdaptiveSheetHeader>
          <div className="flex items-center gap-2">
            <AdaptiveSheetTitle>{detail?.name ?? "Skill"}</AdaptiveSheetTitle>
            {detail ? (
              <Badge variant="secondary">{detail.enabled ? "Enabled" : "Disabled"}</Badge>
            ) : null}
          </div>
          <AdaptiveSheetDescription>
            {detail?.description ?? (skill.isError ? skill.error.message : "")}
          </AdaptiveSheetDescription>
        </AdaptiveSheetHeader>
        {detail ? (
          <>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-3 text-sm text-muted-foreground select-none">
              <span>
                {detail.sourceId
                  ? `From ${sourceOf(detail.sourceId)}`
                  : "Written in this workspace"}
              </span>
              {detail.addedBy ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Added by {detail.addedBy.name}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <FormattedDate value={detail.createdAt} />
              {files > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{files === 1 ? "1 extra file" : `${files} extra files`}</span>
                </>
              ) : null}
            </p>
            <Separator />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <Markdown>{detail.content}</Markdown>
            </div>
            <AdaptiveSheetFooter>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="destructive"
                  onClick={() => remove.mutate(detail.id)}
                  loading={remove.isPending}
                >
                  Remove
                </Button>
                <Button
                  variant={detail.enabled ? "secondary" : "default"}
                  onClick={() => setEnabled.mutate({ id: detail.id, enabled: !detail.enabled })}
                  loading={setEnabled.isPending}
                >
                  {detail.enabled ? "Disable" : "Enable for the workspace"}
                </Button>
              </div>
            </AdaptiveSheetFooter>
          </>
        ) : null}
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
