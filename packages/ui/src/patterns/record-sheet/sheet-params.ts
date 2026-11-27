import { createSerializer, parseAsString, parseAsStringLiteral } from "nuqs";

export const RECORD_TAB_PARAM = "tab";

export type RecordTabs<Tab extends string> = readonly [Tab, ...Tab[]];

export function recordTabParser<Tab extends string>(tabs: RecordTabs<Tab>) {
  return parseAsStringLiteral(tabs).withDefault(tabs[0]);
}

export function recordParsers<Tab extends string>(tabs: RecordTabs<Tab>) {
  return { id: parseAsString, tab: parseAsStringLiteral(tabs) };
}

export function urlKeysOf(recordKey: string) {
  return { id: recordKey, tab: RECORD_TAB_PARAM };
}

export function recordSheetUrl<Tab extends string>(
  base: string,
  { recordKey, id, tabs, tab }: { recordKey: string; id: string; tabs: RecordTabs<Tab>; tab?: Tab },
) {
  const serialize = createSerializer(recordParsers(tabs), {
    urlKeys: urlKeysOf(recordKey),
  });

  return serialize(base, { id, tab: tab === tabs[0] ? null : (tab ?? null) });
}
