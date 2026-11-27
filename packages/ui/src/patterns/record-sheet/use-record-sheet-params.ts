import { parseAsString, useQueryStates } from "nuqs";
import { type RecordTabs, recordParsers, urlKeysOf } from "./sheet-params";

export type RecordSheetParams<Tab extends string> = {
  id: string | null;
  tab: Tab;
  open: (id: string, tab?: Tab) => Promise<URLSearchParams>;
  setTab: (tab: Tab) => Promise<URLSearchParams>;
  close: () => Promise<URLSearchParams>;
};

export function useRecordSheetParams<Tab extends string>({
  recordKey,
  tabs,
  closeKeys = [],
}: {
  recordKey: string;
  tabs: RecordTabs<Tab>;
  closeKeys?: readonly string[];
}): RecordSheetParams<Tab> {
  const [{ id, tab }, setRecord] = useQueryStates(recordParsers(tabs), {
    urlKeys: urlKeysOf(recordKey),
  });

  const [, setCloseKeys] = useQueryStates(
    Object.fromEntries(closeKeys.map((key) => [key, parseAsString])),
  );

  return {
    id,
    tab: id === null || tab === null ? tabs[0] : tab,
    open: (next, nextTab) =>
      setRecord(
        { id: next, tab: nextTab === tabs[0] ? null : (nextTab ?? null) },
        { history: "push" },
      ),
    setTab: (next) => setRecord({ tab: next === tabs[0] ? null : next }, { history: "replace" }),
    close: () => {
      void setCloseKeys(Object.fromEntries(closeKeys.map((key) => [key, null])));

      return setRecord({ id: null, tab: null }, { history: "push" });
    },
  };
}
