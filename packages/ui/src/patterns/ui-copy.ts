/**
 * English copy for the shared patterns (data table, page shell, record sheet). One place for
 * every string, so a later i18n layer can replace this module without touching the components.
 */
export const LOCALE = "en-US";

const numberFormat = new Intl.NumberFormat(LOCALE);

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 }).format(
    value / 100,
  );
}

const DATE = { day: "numeric", month: "short", year: "numeric" } as const;

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";

  return new Date(value).toLocaleDateString(LOCALE, DATE);
}

/** Formats the calendar day of an ISO date or timestamp, ignoring its time and zone. */
export function formatDay(value: string): string {
  const [year = 0, month = 1, day = 1] = value.slice(0, 10).split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(LOCALE, DATE);
}

export const UI_COPY = {
  none: "None",
  loading: "Loading…",
  close: "Close",
  clear: "Clear",
  previous: "Previous",
  next: "Next",

  tableOptions: "Table options",
  view: "View",
  all: "All",
  filters: "Filters",
  sort: "Sort",
  sortBy: "Sort by",
  detail: "Detail",
  ascending: "Ascending",
  descending: "Descending",
  toggleColumns: "Show or hide columns",
  rowActions: "Actions",
  noResultsFound: "No results found.",
  noMatchingResults: "No matching results.",
  selectAllRows: "Select all rows on this page",
  selectRow: "Select row",
  selectNamedRow: (name: string) => `Select ${name}`,
  selected: "selected",
  searchFacet: (facet: string) => `Search ${facet.toLowerCase()}…`,
  facetEmpty: "No items match.",
  showing: (range: { start: string; end: string; total: string }) =>
    `Showing ${range.start}–${range.end} of ${range.total}`,
  tableCount: (count: { shown: string; total: string; noun: string }) =>
    `${count.shown} of ${count.total} ${count.noun}`,
  clearSearch: "Clear search",
  noSearchMatch: (match: { noun: string; query: string }) =>
    `No ${match.noun} match “${match.query}”`,
  noSearchMatchHint: "Make sure that the spelling is correct, or use fewer words.",
  bulkActions: "Actions",

  recordDetails: "Details",
  moreActions: "More actions",
  loadingRecord: (label: string) => `Loading the ${label.toLowerCase()}`,
} as const;
