import trashCan from "@carbon/icons/es/trash-can/16.js";
import type { MemoryGraph } from "@crm/core/api";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { FormattedDate } from "@crm/ui/patterns/formatted-date";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { forgetMutation, type MemoryTarget } from "../../lib/memory.ts";
import { sourceKindLabel } from "./memory-copy.ts";

const TrashIcon = carbonIcon(trashCan);

/** One source: where it came from and the facts read from it. Members forget wrong facts here. */
export function SourceSheet({
  source,
  target,
  onClose,
}: {
  source: MemoryGraph["documents"][number];
  target: MemoryTarget;
  onClose: () => void;
}) {
  const forget = useMutation({
    ...forgetMutation,
    onSuccess: () => toast.success("Fact forgotten"),
    onError: (error) => toast.error(error.message),
  });

  const facts = source.memories.filter((fact) => fact.isLatest && !fact.isForgotten);

  return (
    <AdaptiveSheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AdaptiveSheetContent>
        <AdaptiveSheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{sourceKindLabel(source.documentType)}</Badge>
            <span className="text-xs text-muted-foreground">
              <FormattedDate value={source.updatedAt} />
            </span>
          </div>
          <AdaptiveSheetTitle>{source.title ?? "Untitled source"}</AdaptiveSheetTitle>
          <AdaptiveSheetDescription>
            {facts.length === 0
              ? "No facts read from this source yet."
              : `${facts.length} ${facts.length === 1 ? "fact" : "facts"} read from this source.`}
          </AdaptiveSheetDescription>
        </AdaptiveSheetHeader>
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-4">
          {facts.map((fact) => (
            <li
              key={fact.id}
              className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <p className="min-w-0 flex-1 text-pretty text-sm select-text">{fact.memory}</p>
              <Tooltip>
                <TooltipTrigger
                  delay={400}
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Forget this fact"
                      loading={forget.isPending && forget.variables.factId === fact.id}
                      onClick={() => forget.mutate({ ...target, factId: fact.id })}
                    >
                      <TrashIcon />
                    </Button>
                  }
                />
                <TooltipContent>Forget</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
