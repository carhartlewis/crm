import { Markdown } from "@crm/ui/components/markdown";
import { DayCell, StatusCell } from "@crm/ui/patterns/data-table/table-cells";
import { RailFacts } from "@crm/ui/patterns/record-sheet/record-rail";
import { RecordSection } from "@crm/ui/patterns/record-sheet/record-section";
import { RecordHeader, RecordSheet } from "@crm/ui/patterns/record-sheet/record-sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  removeSkillMutation,
  setSkillEnabledMutation,
  type SkillItem,
  skillQuery,
  skillsCollection,
} from "../../lib/skills.ts";

const onError = (error: Error) => toast.error(error.message);

/** `owner/repo/skill` → `owner/repo`; the skill's own name is already the title. */
function sourceOf(skill: SkillItem) {
  return skill.sourceId ? skill.sourceId.split("/").slice(0, -1).join("/") : "This workspace";
}

/**
 * A skill as a record, like a company: name and actions in the header, what it's for and its
 * instructions in the body, facts in the rail. Everything but the file count comes from the
 * synced skill, so it opens at once; the file list loads on demand. The sheet itself loads on
 * demand (the Markdown renderer is WebAssembly) and stays mounted so it can animate out.
 */
export default function SkillSheet({
  userId,
  workspaceId,
  id,
  skill: detail,
  onClose,
}: {
  userId: string;
  workspaceId: string;
  id: string | null;
  /** The synced skill; null while it hasn't arrived, or after someone removed it. */
  skill: SkillItem | null;
  onClose: () => void;
}) {
  const collection = skillsCollection(workspaceId);
  const files = useQuery({ ...skillQuery(userId, workspaceId, id ?? ""), enabled: id !== null });
  const fileCount = files.data?.id === id ? files.data?.files.length : undefined;
  const setEnabled = useMutation({ ...setSkillEnabledMutation, onError });

  const remove = useMutation({
    ...removeSkillMutation,
    onError,
    onSuccess: () => {
      toast("The skill is removed for everyone.");
      onClose();
    },
  });

  return (
    <RecordSheet
      open={id !== null}
      onClose={onClose}
      label="Skill"
      loading={id !== null && !detail}
      // One tab, so no tab bar; `?tab=` is already the page's.
      tab="instructions"
      onTabChange={() => undefined}
      header={
        detail ? (
          <RecordHeader
            title={detail.name}
            actions={[
              {
                id: "enable",
                label: detail.enabled ? "Disable" : "Enable for the workspace",
                disabled: setEnabled.isPending,
                onSelect: () =>
                  setEnabled.mutate({ collection, id: detail.id, enabled: !detail.enabled }),
              },
            ]}
            menu={[
              {
                id: "remove",
                label: "Remove",
                destructive: true,
                disabled: remove.isPending,
                onSelect: () => remove.mutate({ collection, id: detail.id }),
              },
            ]}
          />
        ) : null
      }
      tabs={[
        {
          id: "instructions",
          label: "Instructions",
          content: detail ? (
            <>
              <RecordSection label="When to use it">
                <p className="text-body">{detail.description}</p>
              </RecordSection>
              <RecordSection label="Instructions">
                <Markdown>{detail.content}</Markdown>
              </RecordSection>
            </>
          ) : null,
        },
      ]}
      rail={
        detail ? (
          <RailFacts
            facts={[
              {
                kind: "status",
                label: "Status",
                value: (
                  // The cell is a full-width row; inline it so the rail's right alignment holds.
                  <span className="inline-flex">
                    <StatusCell tone={detail.enabled ? "done" : "open"}>
                      {detail.enabled ? "Enabled" : "Disabled"}
                    </StatusCell>
                  </span>
                ),
              },
              { kind: "property", label: "Source", value: sourceOf(detail) },
              { kind: "person", label: "Added by", value: detail.addedBy?.name ?? "—" },
              {
                kind: "count",
                label: "Extra files",
                value: fileCount === undefined ? "…" : String(fileCount),
              },
              { kind: "date", label: "Added", value: <DayCell value={detail.createdAt} /> },
            ]}
          />
        ) : null
      }
    />
  );
}
