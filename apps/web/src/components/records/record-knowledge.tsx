import type { MemoryTarget } from "../../lib/memory.ts";
import { MemoryActions, MemoryView } from "../memory/memory-view.tsx";

/** A record's memory in its sheet: the graph, filling the Knowledge tab, plus notes. */
export function RecordKnowledge({
  userId,
  workspaceId,
  target,
  subject,
  expectUntil = 0,
  researching = false,
}: {
  userId: string;
  workspaceId: string;
  target: MemoryTarget;
  /** The record's name, in copy. */
  subject: string;
  /** Until when (epoch ms) an empty memory waits for its first source. */
  expectUntil?: number;
  researching?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-3">
      <div className="flex justify-end">
        <MemoryActions />
      </div>
      <MemoryView
        userId={userId}
        workspaceId={workspaceId}
        target={target}
        subject={subject}
        expectUntil={expectUntil}
        researching={researching}
        fill
      />
    </div>
  );
}
