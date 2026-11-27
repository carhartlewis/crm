import add from "@carbon/icons/es/add/16.js";
import renew from "@carbon/icons/es/renew/16.js";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import { preloadable } from "@crm/ui/lib/preloadable";
import {
  MemoryGraphSkeleton,
  MemoryGraphToolbar,
  type MemoryGraphLabels,
} from "@crm/ui/patterns/memory-graph";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import { Suspense } from "react";
import { toast } from "sonner";
import {
  knowledgeQuery,
  type MemoryTarget,
  memoryGraphQuery,
  memorySearchQuery,
  researchMutation,
} from "../../lib/memory.ts";
import { AddNoteSheet } from "./add-note-sheet.tsx";
import { sourceKindLabel } from "./memory-copy.ts";
import { SourceSheet } from "./source-sheet.tsx";

const MemoryCanvas = preloadable(() => import("./memory-canvas.tsx"));

const AddIcon = carbonIcon(add);
const RenewIcon = carbonIcon(renew);

const POLL_MS = 4_000;

/** Overlay state in the URL, so a source or a search is linkable and back-button safe. */
const params = {
  mq: parseAsString.withDefault(""),
  source: parseAsString,
  note: parseAsBoolean.withDefault(false),
};

const LABELS: MemoryGraphLabels = {
  documentGroup: "Sources",
  documentTypeFallback: "Source",
  documentSourceEdge: "Source link",
  documentToMemoryEdge: "Source to fact",
  memoryCount: (count) => `${count} ${count === 1 ? "fact" : "facts"}`,
  documentIdLabel: "Source",
  viewDocument: "Open source",
  goToDocument: "Go to source",
  nextDocument: "Next source",
  previousDocument: "Previous source",
  showMemory: "Go to fact",
  loadingMoreDocuments: (count) => `Loading ${count} sources`,
};

export interface MemoryViewProps {
  readonly userId: string;
  readonly workspaceId: string;
  readonly target: MemoryTarget;
  /** Who the memory is about, in copy: the workspace's or the company's name. */
  readonly subject: string;
  /** Fill the page (Workspace Memory) rather than a fixed height (a company's tab). */
  readonly fill?: boolean;
}

/** Add a note, and read the website again when there is one. */
export function MemoryActions({
  target,
  canResearch,
}: {
  target: MemoryTarget;
  canResearch: boolean;
}) {
  const [, setState] = useQueryStates(params, { history: "push" });

  const research = useMutation({
    ...researchMutation,
    onSuccess: () => toast.success("Reading the website. New facts appear in a minute."),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex items-center gap-2">
      {canResearch ? (
        <Button
          variant="outline"
          size="sm"
          loading={research.isPending}
          onClick={() => research.mutate(target)}
        >
          <RenewIcon data-icon="inline-start" />
          Research website
        </Button>
      ) : null}
      <Button
        size="sm"
        onPointerEnter={() => void MemoryCanvas.preload()}
        onClick={() => void setState({ note: true })}
      >
        <AddIcon data-icon="inline-start" />
        Add note
      </Button>
    </div>
  );
}

/**
 * A memory as comp-neo shows it: Supermemory's graph of sources and the facts read from them,
 * with search over the facts. Opening a source lists its facts, where members forget wrong ones.
 */
export function MemoryView({
  userId,
  workspaceId,
  target,
  subject,
  fill = false,
}: MemoryViewProps) {
  const [state, setState] = useQueryStates(params, { history: "push" });

  const knowledge = useQuery(knowledgeQuery(userId, workspaceId, target));

  const processing =
    knowledge.data?.sources.some((source) => source.status === "processing") ?? false;

  const graph = useQuery({
    ...memoryGraphQuery(userId, workspaceId, target),
    refetchInterval: processing ? POLL_MS : false,
  });

  const query = state.mq.trim().slice(0, 500);

  const search = useQuery({
    ...memorySearchQuery(userId, workspaceId, target, query),
    enabled: query !== "",
    placeholderData: keepPreviousData,
  });

  if (knowledge.data && !knowledge.data.enabled) {
    return (
      <p className="text-pretty text-sm text-muted-foreground">
        Memory is off. Set SUPERMEMORY_API_KEY on the API to let the CRM remember what it learns.
      </p>
    );
  }

  const documents = (graph.data?.documents ?? []).map((document) => ({
    id: document.id,
    title: document.title,
    summary: document.summary,
    documentType: sourceKindLabel(document.documentType),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    memories: [...document.memories],
  }));

  const hits = query ? (search.data ?? []) : [];
  const highlighted = [...new Set(hits.flatMap((hit) => (hit.sourceId ? [hit.sourceId] : [])))];
  const open = graph.data?.documents.find((document) => document.id === state.source);

  return (
    <>
      <Suspense fallback={<MemoryGraphSkeleton fill={fill} />}>
        <MemoryCanvas
          fill={fill}
          documents={documents}
          label={`What the CRM knows about ${subject}`}
          labels={LABELS}
          loading={graph.isPending}
          highlightIds={highlighted}
          onOpenMemory={(id) => void setState({ source: id })}
          empty={
            query
              ? "No matching facts."
              : processing
                ? `Learning about ${subject}…`
                : `Nothing remembered about ${subject} yet. Add a note, or tell the assistant.`
          }
          toolbar={
            <MemoryGraphToolbar
              query={query}
              labels={{ search: "Search memory", clear: "Clear search", results: "Matching facts" }}
              onSearch={(mq) => void setState({ mq })}
              results={hits.map((hit) => ({ id: hit.id, kind: "fact" as const, text: hit.text }))}
              onOpenResult={(result) => {
                const sourceId = hits.find((hit) => hit.id === result.id)?.sourceId;

                if (sourceId) void setState({ source: sourceId });
              }}
              status={
                search.isFetching
                  ? "Searching memory…"
                  : search.error
                    ? search.error.message
                    : search.isSuccess && hits.length === 0
                      ? "No matching facts."
                      : undefined
              }
            />
          }
          summary={
            graph.data ? (
              <>
                <span>{`Facts: ${graph.data.totals.facts} · Sources: ${graph.data.totals.sources}`}</span>
                {processing ? <output>Learning from new sources…</output> : null}
              </>
            ) : undefined
          }
        />
      </Suspense>
      {state.note ? (
        <AddNoteSheet
          target={target}
          subject={subject}
          onClose={() => void setState({ note: false })}
        />
      ) : null}
      {open ? (
        <SourceSheet
          key={open.id}
          source={open}
          target={target}
          onClose={() => void setState({ source: null })}
        />
      ) : null}
    </>
  );
}
