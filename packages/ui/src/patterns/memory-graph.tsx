import close from "@carbon/icons/es/close/16.js";
import documentIcon from "@carbon/icons/es/document/16.js";
import hexagon from "@carbon/icons/es/hexagon--outline/16.js";
import search from "@carbon/icons/es/search/16.js";
import {
  MemoryGraph as SupermemoryGraph,
  type MemoryGraphLabels,
  type MemoryGraphProps,
} from "@supermemory/memory-graph";
import type { ReactNode } from "react";
import { carbonIcon } from "../components/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../components/input-group";
import { Skeleton } from "../components/skeleton";

export type { MemoryGraphLabels } from "@supermemory/memory-graph";

export type MemoryGraphDocuments = MemoryGraphProps["documents"];

const CloseIcon = carbonIcon(close);
const DocumentIcon = carbonIcon(documentIcon);
const FactIcon = carbonIcon(hexagon);
const SearchIcon = carbonIcon(search);

// The frame paints the page background. The library would otherwise read `--graph-bg` when its
// module loads, which can be before the stylesheet arrives.
const GRAPH_COLORS = { bg: "transparent" } as const;

// Stable empty defaults, so the canvas never sees a new array on each render.
const NO_IDS: string[] = [];

const NO_RESULTS: readonly MemoryGraphResult[] = [];

/**
 * The interactive memory graph (Supermemory's canvas): sources and the facts extracted from
 * them. Adapted from comp-neo's pattern. Load it with `preloadable()`: the canvas is large.
 */
export function MemoryGraph({
  documents,
  label,
  labels,
  loading = false,
  empty,
  toolbar,
  summary,
  highlightIds = NO_IDS,
  onOpenMemory,
  fill = false,
}: {
  documents: MemoryGraphDocuments;
  label: string;
  labels: MemoryGraphLabels;
  loading?: boolean;
  empty: ReactNode;
  /** Search and its results, over the top left of the canvas. */
  toolbar?: ReactNode;
  /** Counts and extraction status, over the top right of the canvas. */
  summary?: ReactNode;
  highlightIds?: string[];
  onOpenMemory: (id: string) => void;
  /** Fill the parent's height (a full-page memory); otherwise a fixed height (a tab). */
  fill?: boolean;
}) {
  return (
    <section
      data-fill={fill || undefined}
      data-slot="memory-graph"
      aria-label={label}
      aria-busy={loading}
      className="relative h-144 min-h-96 w-full flex-1 overflow-hidden rounded-lg border bg-background select-none data-fill:h-full"
    >
      <SupermemoryGraph
        documents={documents}
        isLoading={loading}
        highlightDocumentIds={highlightIds}
        highlightsVisible={highlightIds.length > 0}
        labels={labels}
        colors={GRAPH_COLORS}
        onOpenDocument={onOpenMemory}
        openDocumentOnEnter
        variant="console"
      >
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-pretty text-muted-foreground">
          {empty}
        </div>
      </SupermemoryGraph>
      {toolbar || summary ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
          {toolbar ? (
            <div className="pointer-events-auto w-full min-w-0 sm:w-96">{toolbar}</div>
          ) : null}
          {summary ? (
            <div className="hidden shrink-0 flex-col items-end gap-1 rounded-lg bg-background px-2 py-1.5 text-xs text-muted-foreground tabular-nums sm:flex">
              {summary}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** What the graph's frame shows while its chunk loads. */
export function MemoryGraphSkeleton({ fill = false }: { fill?: boolean }) {
  return (
    <div
      data-fill={fill || undefined}
      className="h-144 min-h-96 w-full flex-1 overflow-hidden rounded-lg border data-fill:h-full"
      aria-busy
    >
      <Skeleton className="size-full" />
    </div>
  );
}

export interface MemoryGraphResult {
  readonly id: string;
  readonly kind: "fact" | "source";
  readonly text: string;
}

/** Search over the graph, with its results in a list below. */
export function MemoryGraphToolbar({
  query,
  labels,
  onSearch,
  results = NO_RESULTS,
  onOpenResult,
  status,
}: {
  query: string;
  labels: { search: string; clear: string; results: string };
  onSearch: (query: string) => void;
  results?: readonly MemoryGraphResult[];
  onOpenResult: (result: MemoryGraphResult) => void;
  status?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <search className="min-w-0">
        <form
          key={query}
          onSubmit={(event) => {
            event.preventDefault();

            const value = new FormData(event.currentTarget).get("query");

            onSearch(
              String(value ?? "")
                .trim()
                .slice(0, 500),
            );
          }}
        >
          <InputGroup className="bg-background">
            <InputGroupInput
              aria-label={labels.search}
              placeholder={labels.search}
              defaultValue={query}
              maxLength={500}
              autoComplete="off"
              name="query"
              type="search"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={labels.clear}
                  size="icon-sm"
                  onClick={() => onSearch("")}
                >
                  <CloseIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </form>
      </search>
      {query ? (
        <section
          aria-label={labels.results}
          className="flex max-h-72 min-w-0 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {status ? <output className="px-2 py-1.5 text-muted-foreground">{status}</output> : null}
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onOpenResult(result)}
              className="flex min-h-9 min-w-0 shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
            >
              {result.kind === "fact" ? (
                <FactIcon aria-hidden className="shrink-0 text-muted-foreground" />
              ) : (
                <DocumentIcon aria-hidden className="shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{result.text}</span>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}
