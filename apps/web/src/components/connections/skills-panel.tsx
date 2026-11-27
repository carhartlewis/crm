import add from "@carbon/icons/es/add/16.js";
import type { SkillsShResult } from "@crm/core/api";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  DataTable,
  type DataTableColumn,
  StaticTable,
  type StaticTableColumn,
} from "@crm/ui/patterns/data-table/data-table";
import { createListSearchParams } from "@crm/ui/patterns/data-table/list-search-params";
import {
  CountCell,
  DayCell,
  StatusCell,
  TextCell,
  TitleCell,
} from "@crm/ui/patterns/data-table/table-cells";
import { useListTable } from "@crm/ui/patterns/data-table/use-list-table";
import { RecordRowMenu } from "@crm/ui/patterns/record-sheet/record-sheet";
import { preloadable } from "@crm/ui/lib/preloadable";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "sonner";
import { ConnectionsToolbar, type ConnectionsToolbarParts } from "./connections-toolbar.tsx";
import {
  discoverQuery,
  installSkillMutation,
  removeSkillMutation,
  setSkillEnabledMutation,
  type SkillItem,
  skillsCollection,
} from "../../lib/skills.ts";

const AddIcon = carbonIcon(add);

const onError = (error: Error) => toast.error(error.message);

/** The skill reader: loaded when a row is hovered or focused (its renderer is WebAssembly). */
const SkillSheet = preloadable(() => import("./skill-sheet.tsx"));

const preloadSheet = () => void SkillSheet.preload();

/** Search is the page toolbar's `?q=`; the table owns only its sort and page. */
const SEARCH_PARAMS = createListSearchParams({ defaultSort: "createdAt", defaultDir: "desc" });

type Column = "name" | "status" | "description" | "addedBy" | "createdAt";

const COLUMNS: DataTableColumn<SkillItem, Column>[] = [
  {
    id: "name",
    kind: "title",
    header: "Name",
    sortable: true,
    hideable: false,
    cell: (row) => <TitleCell>{row.name}</TitleCell>,
  },
  {
    id: "status",
    kind: "status",
    header: "Status",
    sortable: true,
    cell: (row) => (
      <StatusCell tone={row.enabled ? "done" : "open"}>
        {row.enabled ? "Enabled" : "Disabled"}
      </StatusCell>
    ),
  },
  {
    id: "description",
    kind: "text",
    header: "When to use it",
    cell: (row) => <TextCell>{row.description}</TextCell>,
  },
  {
    id: "addedBy",
    kind: "person",
    header: "Added by",
    sortable: true,
    cell: (row) => <TextCell>{row.addedBy?.name ?? null}</TextCell>,
  },
  {
    id: "createdAt",
    kind: "date",
    header: "Added",
    sortable: true,
    cell: (row) => <DayCell value={row.createdAt} />,
  },
];

/** A row's "…" menu. */
function skillRowMenu(actions: {
  open: (id: string) => void;
  toggle: (row: SkillItem) => void;
  remove: (row: SkillItem) => void;
}) {
  return function SkillRowMenu(row: SkillItem) {
    return (
      <RecordRowMenu
        label={`Actions for ${row.name}`}
        items={[
          { id: "read", label: "Read", onSelect: () => actions.open(row.id) },
          {
            id: "enable",
            label: row.enabled ? "Disable" : "Enable",
            onSelect: () => actions.toggle(row),
          },
          { id: "remove", label: "Remove", destructive: true, onSelect: () => actions.remove(row) },
        ]}
      />
    );
  };
}

/** Discover's columns; `adding` is the skill being added, if any. */
function discoverColumns(install: {
  add: (id: string) => void;
  adding: string | null;
  /** Whether the workspace has a copy, from the synced skills (not the search's snapshot). */
  copied: (id: string) => boolean;
}): StaticTableColumn<SkillsShResult>[] {
  return [
    {
      id: "name",
      kind: "title",
      header: "Name",
      cell: (row) => <TitleCell>{row.name}</TitleCell>,
    },
    {
      id: "source",
      kind: "text",
      header: "Source",
      cell: (row) => <TextCell>{row.source}</TextCell>,
    },
    {
      id: "installs",
      kind: "count",
      header: "Installs",
      cell: (row) => <CountCell>{row.installs.toLocaleString()}</CountCell>,
    },
    {
      id: "add",
      kind: "action",
      header: <span className="sr-only">Add</span>,
      label: "Add",
      cell: (row) =>
        install.copied(row.id) ? (
          <span className="text-muted-foreground">Added</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="-my-1"
            onClick={() => install.add(row.id)}
            loading={install.adding === row.id}
          >
            <AddIcon />
            Add
          </Button>
        ),
    },
  ];
}

interface Scope {
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * Skills shared by everyone in the workspace. "Yours" lists them, filtered by `query` as you
 * type; "Discover" searches skills.sh with `settledQuery` (the URL value, which waits for a pause
 * in typing). An added skill starts disabled: open it (`?skill=<id>`), read it, then enable it.
 */
export function SkillsPanel({
  userId,
  workspaceId,
  skills,
  view,
  settledQuery,
  toolbar,
}: Scope & {
  skills: readonly SkillItem[];
  view: "yours" | "discover";
  settledQuery: string;
  /** The page's tabs and search; the table shows them on one line with its Sort. */
  toolbar: ConnectionsToolbarParts;
}) {
  const [open, setOpen] = useQueryState("skill", parseAsString);
  const scope = { userId, workspaceId };

  return (
    <>
      {view === "yours" ? (
        <YourSkills
          workspaceId={workspaceId}
          skills={skills}
          toolbar={toolbar}
          onOpen={(id) => void setOpen(id)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ConnectionsToolbar {...toolbar} />
          <DiscoverSkills
            scope={scope}
            skills={skills}
            query={settledQuery}
            onOpen={(id) => void setOpen(id)}
          />
        </div>
      )}
      {open ? (
        <Suspense fallback={null}>
          <SkillSheet
            userId={userId}
            workspaceId={workspaceId}
            skill={skills.find((skill) => skill.id === open) ?? null}
            id={open}
            onClose={() => void setOpen(null)}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function YourSkills({
  workspaceId,
  skills,
  toolbar,
  onOpen,
}: {
  workspaceId: string;
  skills: readonly SkillItem[];
  toolbar: ConnectionsToolbarParts;
  onOpen: (id: string) => void;
}) {
  const collection = skillsCollection(workspaceId);
  const setEnabled = useMutation({ ...setSkillEnabledMutation, onError });

  const remove = useMutation({
    ...removeSkillMutation,
    onError,
    onSuccess: () => toast("The skill is removed for everyone."),
  });

  const list = useListTable({
    tableId: "skills",
    searchParams: SEARCH_PARAMS,
    rows: skills,
    loading: false,
    getRowId: (row) => row.id,
    haystack: (row) => `${row.name} ${row.description} ${row.addedBy?.name ?? ""}`,
    sortValues: {
      name: (row) => row.name,
      status: (row) => (row.enabled ? 0 : 1),
      addedBy: (row) => row.addedBy?.name ?? "",
      createdAt: (row) => row.createdAt,
    },
    facetOf: {},
    noun: "skills",
    searchPlaceholder: "Search",
    blank: {
      title: "No shared skills",
      description: "Add one from Discover, or create your own with Add.",
    },
    filtered: "No matching skills.",
  });

  return (
    <DataTable
      {...list.tableProps}
      lead={toolbar.tabs}
      search={toolbar.search}
      meta={null}
      columns={COLUMNS}
      onRowClick={(row) => onOpen(row.id)}
      onRowHover={preloadSheet}
      rowActions={skillRowMenu({
        open: onOpen,
        toggle: (row) => setEnabled.mutate({ collection, id: row.id, enabled: !row.enabled }),
        remove: (row) => remove.mutate({ collection, id: row.id }),
      })}
    />
  );
}

function DiscoverSkills({
  scope,
  skills,
  query,
  onOpen,
}: {
  scope: Scope;
  skills: readonly SkillItem[];
  query: string;
  onOpen: (id: string) => void;
}) {
  const text = query.trim();
  const collection = skillsCollection(scope.workspaceId);
  const results = useQuery(discoverQuery(scope.userId, scope.workspaceId, text));
  // "Added" follows the synced skills, so an install shows without searching again.
  const copied = new Set(skills.map((skill) => skill.sourceId));

  const install = useMutation({
    ...installSkillMutation,
    onError,
    onSuccess: (id) => {
      // The new row has synced by now (the mutation awaited its txid).
      const name = collection.get(id)?.name ?? "The skill";

      toast(`${name} is added, but off. Read it, then enable it.`);
      onOpen(id);
    },
  });

  const columns = discoverColumns({
    add: (sourceId) => install.mutate({ collection, sourceId }),
    adding: install.isPending ? install.variables.sourceId : null,
    copied: (id) => copied.has(id),
  });

  return (
    <StaticTable
      label={text ? "Matching skills" : "Top skills"}
      columns={columns}
      rows={[...(results.data ?? [])]}
      getRowId={(row) => row.id}
      loading={results.isPending}
      loadingRows={8}
      empty={
        results.isError ? (
          <span className="text-destructive">{results.error.message}</span>
        ) : text ? (
          `No skills match “${text}”.`
        ) : (
          "No skills to show right now."
        )
      }
    />
  );
}
