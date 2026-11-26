import { useCallback, useState } from "react";
import { type FitRowsLayout, fitRowCount } from "./fit-rows";

const DEFAULT_LAYOUT = {
  headerHeight: 46,
  rowHeight: 48,
  footerHeight: 44,
} as const;

function heightOf(element: Element | null | undefined) {
  return element?.getBoundingClientRect().height ?? 0;
}

function measureLayout(box: HTMLElement): FitRowsLayout {
  const table = box.firstElementChild;
  const frame = table?.querySelector("section");
  const rows = frame ? [...frame.querySelectorAll("tbody tr")] : [];
  const pager = table?.querySelector("[data-slot=table-pagination]");
  const gap = table ? Number.parseFloat(getComputedStyle(table).rowGap) : 0;
  const rowHeight = Math.max(0, ...rows.map(heightOf));

  return {
    height: box.clientHeight,
    headerHeight:
      frame && rowHeight > 0
        ? heightOf(frame) - rows.reduce((height, row) => height + heightOf(row), 0)
        : DEFAULT_LAYOUT.headerHeight,
    rowHeight: rowHeight > 0 ? rowHeight : DEFAULT_LAYOUT.rowHeight,
    footerHeight: pager
      ? heightOf(pager) + (Number.isNaN(gap) ? 0 : gap)
      : DEFAULT_LAYOUT.footerHeight,
  };
}

export function useFitRows(fallback: number) {
  const [rows, setRows] = useState<number | null>(null);

  const ref = useCallback((box: HTMLElement | null) => {
    if (!box) return;

    const observer = new ResizeObserver(() => measure());

    function measure() {
      if (!box) return;

      const table = box.firstElementChild;

      if (table) observer.observe(table);

      setRows(fitRowCount(measureLayout(box)));
    }

    observer.observe(box);
    measure();

    return () => observer.disconnect();
  }, []);

  return { ref, rows: rows ?? fallback };
}
