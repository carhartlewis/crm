import type { MemoryGraph } from "@crm/core/api";
import { Markdown } from "@crm/ui/components/markdown";
import { DataTable, type DataTableColumn } from "@crm/ui/patterns/data-table/data-table";
import { createListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import { DayCell, StatusCell } from "@crm/ui/patterns/data-table/table-cells";
import { useListTable } from "@crm/ui/patterns/data-table/use-list-table";
import { RailFacts } from "@crm/ui/patterns/record-sheet/record-rail";
import { RecordSection } from "@crm/ui/patterns/record-sheet/record-section";
import {
  RecordHeader,
  RecordRowMenu,
  RecordSheet,
} from "@crm/ui/patterns/record-sheet/record-sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import {
  deleteSourceMutation,
  forgetMutation,
  type MemoryTarget,
  memorySourceQuery,
} from "../../lib/memory.ts";
import { sourceKindLabel } from "./memory-copy.ts";

type Source = MemoryGraph["documents"][number];

type Fact = Source["memories"][number];

const TABS = ["facts", "text"] as const;

const onError = (error: Error) => toast.error(error.message);

/** The facts table's search, sort and page, scoped so they never collide with the page's table. */
const FACT_PARAMS = createListSearchParams({
  scope: "fact",
  defaultSort: "learned",
  defaultDir: "desc",
});

type FactColumn = "fact" | "learned";

const FACT_COLUMNS: DataTableColumn<Fact, FactColumn>[] = [
  {
    id: "fact",
    kind: "title",
    header: "Fact",
    sortable: true,
    hideable: false,
    // Facts are sentences: they wrap instead of truncating.
    cell: (fact) => <span className="block py-1 text-pretty select-text">{fact.memory}</span>,
  },
  {
    id: "learned",
    kind: "date",
    header: "Learned",
    sortable: true,
    cell: (fact) => <DayCell value={fact.createdAt} />,
  },
];

/** A fact's row menu: forget it. */
function factMenu(forget: (fact: Fact) => void) {
  return function FactMenu(fact: Fact) {
    return (
      <RecordRowMenu
        label="Fact actions"
        items={[{ id: "forget", label: "Forget", destructive: true, onSelect: () => forget(fact) }]}
      />
    );
  };
}

const STATUS = {
  processing: { tone: "open", label: "Reading" },
  done: { tone: "done", label: "Read" },
  failed: { tone: "alert", label: "Failed" },
} as const;

/**
 * A source as a record, like a company or a skill: its title and actions in the header, the
 * facts read from it and its own text in tabs, details in the rail. Opens at once from the graph
 * data; the text loads on demand. Loaded with `preloadable()` (Markdown is WebAssembly) and kept
 * mounted so it animates out.
 */
export default function SourceSheet({
  userId,
  workspaceId,
  target,
  source,
  onClose,
}: {
  userId: string;
  workspaceId: string;
  target: MemoryTarget;
  /** The open source from the graph, or null when none is open. */
  source: Source | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useQueryState("sourceTab", parseAsStringLiteral(TABS).withDefault("facts"));

  const detail = useQuery({
    ...memorySourceQuery(userId, workspaceId, target, source?.id ?? ""),
    enabled: source !== null,
  });

  const forget = useMutation({
    ...forgetMutation,
    onError,
    onSuccess: () => toast("Fact forgotten. The assistant won't recall it again."),
  });

  const remove = useMutation({
    ...deleteSourceMutation,
    onError,
    onSuccess: () => {
      toast("Source deleted, with every fact read from it.");
      onClose();
    },
  });

  const facts = (source?.memories ?? []).filter((fact) => fact.isLatest && !fact.isForgotten);
  const status = detail.data ? STATUS[detail.data.status] : null;

  const list = useListTable({
    tableId: "source-facts",
    searchParams: FACT_PARAMS,
    rows: facts,
    loading: false,
    getRowId: (fact) => fact.id,
    haystack: (fact) => fact.memory,
    sortValues: { fact: (fact) => fact.memory, learned: (fact) => fact.createdAt },
    facetOf: {},
    noun: "facts",
    searchPlaceholder: "Search facts",
    blank: {
      title: "No facts yet",
      description: "No facts read from this source yet. New sources take up to a minute.",
    },
    filtered: "No matching facts.",
  });

  return (
    <RecordSheet
      open={source !== null}
      onClose={() => {
        void setTab(null);
        onClose();
      }}
      label="Source"
      tab={tab}
      onTabChange={(next) => void setTab(next)}
      header={
        source ? (
          <RecordHeader
            // The graph's core shows the record's name; the sheet names the source itself.
            title={detail.data?.title ?? source.title ?? "Untitled source"}
            menu={[
              {
                id: "delete",
                label: "Delete source",
                destructive: true,
                disabled: remove.isPending,
                onSelect: () => remove.mutate({ ...target, id: source.id }),
              },
            ]}
          />
        ) : null
      }
      tabs={[
        {
          id: "facts",
          label: `Facts ${facts.length}`,
          // The table fills the tab and pages what fits, like a page's table.
          fills: true,
          content: (
            <DataTable
              {...list.tableProps}
              meta={null}
              columns={FACT_COLUMNS}
              rowActions={factMenu((fact) => forget.mutate({ ...target, factId: fact.id }))}
            />
          ),
        },
        {
          id: "text",
          label: "Text",
          content: detail.data ? (
            <RecordSection label="What was saved">
              <Markdown>{detail.data.content || "This source has no text."}</Markdown>
            </RecordSection>
          ) : detail.error ? (
            <p className="text-pretty text-destructive">{detail.error.message}</p>
          ) : (
            <p className="text-muted-foreground">Loading the source…</p>
          ),
        },
      ]}
      rail={
        source ? (
          <RailFacts
            facts={[
              {
                kind: "property",
                label: "Type",
                value: sourceKindLabel(detail.data?.kind ?? source.documentType),
              },
              {
                kind: "status",
                label: "Status",
                value: status ? (
                  // The cell is a full-width row; inline it so the rail's right alignment holds.
                  <span className="inline-flex">
                    <StatusCell tone={status.tone}>{status.label}</StatusCell>
                  </span>
                ) : (
                  "—"
                ),
              },
              { kind: "count", label: "Facts", value: String(facts.length) },
              { kind: "date", label: "Added", value: <DayCell value={source.createdAt} /> },
              { kind: "date", label: "Updated", value: <DayCell value={source.updatedAt} /> },
            ]}
          />
        ) : null
      }
    />
  );
}
