import { createParser, createSerializer } from "nuqs";

/** The URL key that holds the stack of open record sheets. */
export const SHEET_PARAM = "sheet";

/** Each kind's tabs; the first is the default, left out of the URL. */
export type SheetTabs = { readonly [kind: string]: readonly [string, ...string[]] };

export type SheetEntry = { readonly kind: string; readonly id: string; readonly tab: string };

/**
 * The stack of open record sheets in one URL key, bottom first, such as
 * `?sheet=company:com_1,contact:con_2:deals`. Only the top sheet shows; closing it shows the one
 * it was opened from. Parsing stops at the first entry that isn't a known kind and tab, so a
 * stale link keeps the sheets it can still name.
 */
export function sheetStackParser(tabs: SheetTabs) {
  const parseEntry = (raw: string): SheetEntry | null => {
    const [kind, id, tab, ...rest] = raw.split(":");
    const kindTabs = kind === undefined ? undefined : tabs[kind];

    if (kind === undefined || kindTabs === undefined || !id || rest.length > 0) return null;

    if (tab === undefined) return { kind, id, tab: kindTabs[0] };

    return kindTabs.includes(tab) ? { kind, id, tab } : null;
  };

  const serializeEntry = ({ kind, id, tab }: SheetEntry) =>
    tab === tabs[kind]?.[0] ? `${kind}:${id}` : `${kind}:${id}:${tab}`;

  return createParser<readonly SheetEntry[]>({
    parse: (value) => {
      const entries: SheetEntry[] = [];

      for (const raw of value.split(",")) {
        const entry = parseEntry(raw);

        if (!entry) break;
        entries.push(entry);
      }

      return entries.length > 0 ? entries : null;
    },
    serialize: (entries) => entries.map(serializeEntry).join(","),
    eq: (left, right) =>
      left.length === right.length &&
      left.every((entry, index) => {
        const other = right[index];

        return (
          other !== undefined &&
          entry.kind === other.kind &&
          entry.id === other.id &&
          entry.tab === other.tab
        );
      }),
  }).withDefault([]);
}

export type SheetStackParser = ReturnType<typeof sheetStackParser>;

/**
 * Opens `entry` on top of the stack. A record already in the stack is not opened twice: the
 * stack returns to it, so company → contact → company closes back to the page, not in a loop.
 */
export function pushedSheet(entries: readonly SheetEntry[], entry: SheetEntry): SheetEntry[] {
  const at = entries.findIndex((other) => other.kind === entry.kind && other.id === entry.id);

  return [...(at === -1 ? entries : entries.slice(0, at)), entry];
}

/** Closes the top sheet, showing the one it was opened from. */
export function poppedSheet(entries: readonly SheetEntry[]): SheetEntry[] {
  return entries.slice(0, -1);
}

/** Switches the top sheet's tab. */
export function withTopTab(entries: readonly SheetEntry[], tab: string): SheetEntry[] {
  return entries.map((entry, index) => (index === entries.length - 1 ? { ...entry, tab } : entry));
}

/** A link that opens `entries` over `base`, such as a toast's "Open" action. */
export function sheetUrl(base: string, parser: SheetStackParser, entries: readonly SheetEntry[]) {
  return createSerializer({ [SHEET_PARAM]: parser })(base, { [SHEET_PARAM]: entries });
}
