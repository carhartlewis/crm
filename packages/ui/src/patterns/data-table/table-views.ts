type Option = { value: string; label: string };

export type TableView<TRow> = Option & { test: (row: TRow) => boolean };

export type TableViews<TRow> = {
  counts: Record<string, number>;
  where: ((row: TRow) => boolean) | undefined;
  options: Option[];
};

export function tableViews<TRow>(
  views: readonly TableView<TRow>[],
  rows: readonly TRow[],
  active: string,
): TableViews<TRow> {
  return {
    counts: Object.fromEntries(views.map((view) => [view.value, rows.filter(view.test).length])),
    where: views.find((view) => view.value === active)?.test,
    options: views.map(({ value, label }) => ({ value, label })),
  };
}
