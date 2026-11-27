export type ColumnKind =
  | "code"
  | "title"
  | "status"
  | "progress"
  | "short"
  | "text"
  | "detail"
  | "person"
  | "count"
  | "date"
  | "action"
  | "input";

export type ColumnMaxWidth = "24" | "32" | "36" | "44" | "56" | "80" | "144";

export type ColumnLayout = {
  maxWidth: ColumnMaxWidth;
  align?: "right";
};

const CONTEXT_RANK = 4;

const COLUMN_KINDS = {
  code: { rank: 0, layout: { maxWidth: "32" } },
  title: { rank: 1, layout: { maxWidth: "80" } },
  status: { rank: 2, layout: { maxWidth: "44" } },
  progress: { rank: 3, layout: { maxWidth: "80" } },
  short: { rank: CONTEXT_RANK, layout: { maxWidth: "32" } },
  text: { rank: CONTEXT_RANK, layout: { maxWidth: "44" } },
  detail: { rank: CONTEXT_RANK, layout: { maxWidth: "144" } },
  person: { rank: CONTEXT_RANK, layout: { maxWidth: "36" } },
  count: { rank: 5, layout: { maxWidth: "32", align: "right" } },
  date: { rank: 6, layout: { maxWidth: "32" } },
  input: { rank: 7, layout: { maxWidth: "56" } },
  action: { rank: 8, layout: { maxWidth: "24", align: "right" } },
} as const satisfies Record<ColumnKind, { rank: number; layout: ColumnLayout }>;

export function columnLayout(kind: ColumnKind): ColumnLayout {
  return COLUMN_KINDS[kind].layout;
}

export function orderColumns<TColumn extends { kind: ColumnKind }>(
  columns: readonly TColumn[],
): TColumn[] {
  return columns.toSorted(
    (left, right) => COLUMN_KINDS[left.kind].rank - COLUMN_KINDS[right.kind].rank,
  );
}
