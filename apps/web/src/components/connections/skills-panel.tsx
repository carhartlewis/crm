import add from "@carbon/icons/es/add/16.js";
import type { SkillsShResult } from "@crm/core/api";
import { Button } from "@crm/ui/components/button";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  DataTable,
  type DataTableColumn,
  StaticTable,
  type StaticTableColumn,
  useHiddenColumns,
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
    cell: (row) => <SkillStatus skill={row} />,
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

/** A skill's state: enabled or disabled. */
function SkillStatus({ skill }: { skill: SkillItem }) {
  return (
    <StatusCell tone={skill.enabled ? "done" : "open"}>
      {skill.enabled ? "Enabled" : "Disabled"}
    </StatusCell>
  );
}

/** A Discover row, with the workspace's copy of it once added. */
interface DiscoverRow {
  readonly result: SkillsShResult;
  readonly skill: SkillItem | undefined;
}

/**
 * Discover's columns. An added skill shows its status, like in Yours; one not yet added shows
 * Add in the same place. `adding` is the skill being added, if any.
 */
function discoverColumns(install: {
  add: (id: string) => void;
  adding: string | null;
}): StaticTableColumn<DiscoverRow>[] {
  return [
    {
      id: "name",
      kind: "title",
      header: "Name",
      hideable: false,
      cell: (row) => <TitleCell>{row.result.name}</TitleCell>,
    },
    {
      id: "status",
      kind: "status",
      header: "Status",
      cell: (row) =>
        row.skill ? (
          <SkillStatus skill={row.skill} />
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="-my-1"
            onClick={() => install.add(row.result.id)}
            loading={install.adding === row.result.id}
          >
            <AddIcon />
            Add
          </Button>
        ),
    },
    {
      id: "source",
      kind: "text",
      header: "Source",
      cell: (row) => <TextCell>{row.result.source}</TextCell>,
    },
    {
      id: "installs",
      kind: "count",
      header: "Installs",
      cell: (row) => <CountCell>{row.result.installs.toLocaleString()}</CountCell>,
    },
  ];
}

/** Enable, disable and remove, shared by both tables' row menus. */
function useSkillActions(collection: ReturnType<typeof skillsCollection>) {
  const setEnabled = useMutation({ ...setSkillEnabledMutation, onError });

  const remove = useMutation({
    ...removeSkillMutation,
    onError,
    onSuccess: () => toast("The skill is removed for everyone."),
  });

  return {
    toggle: (row: SkillItem) =>
      setEnabled.mutate({ collection, id: row.id, enabled: !row.enabled }),
    remove: (row: SkillItem) => remove.mutate({ collection, id: row.id }),
  };
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
        <div className="flex min-h-0 flex-1 flex-col gap-6">
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
  const actions = useSkillActions(collection);

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
      rowActions={skillRowMenu({ open: onOpen, ...actions })}
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

  const actions = useSkillActions(collection);
  // The status follows the synced skills, so an install shows without searching again.
  const bySource = new Map(skills.map((skill) => [skill.sourceId, skill]));

  // A result's id is the skill's source id (`owner/repo/skill`).
  const rows = (results.data ?? []).map((result) => ({ result, skill: bySource.get(result.id) }));

  const menu = skillRowMenu({ open: onOpen, ...actions });

  const columns = discoverColumns({
    add: (sourceId) => install.mutate({ collection, sourceId }),
    adding: install.isPending ? install.variables.sourceId : null,
  });

  // The settings gear, as on Yours; its own URL key, so the two tables hide columns apart.
  const columnsMenu = useHiddenColumns({
    scope: "discover",
    columnsKey: "skills-discover",
    columns,
  });

  return (
    <StaticTable
      // A new search starts on its first page.
      key={text}
      label={text ? "Matching skills" : "Top skills"}
      columns={columns}
      columnsMenu={columnsMenu}
      rows={rows}
      getRowId={(row) => row.result.id}
      onRowClick={(row) => (row.skill ? onOpen(row.skill.id) : undefined)}
      rowActions={(row) => (row.skill ? menu(row.skill) : null)}
      loading={results.isPending}
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
