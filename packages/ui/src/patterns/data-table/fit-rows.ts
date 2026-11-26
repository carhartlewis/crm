export type FitRowsLayout = {
  height: number;
  headerHeight: number;
  rowHeight: number;
  footerHeight: number;
};

export function fitRowCount({
  height,
  headerHeight,
  rowHeight,
  footerHeight,
}: FitRowsLayout): number {
  return Math.max(1, Math.floor((height - headerHeight - footerHeight) / rowHeight));
}
