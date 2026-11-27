/** A grid child's laid-out position, ignoring transforms (`offsetLeft` / `offsetTop`). */
export type GridSpot = { left: number; top: number };

/** How many columns a grid shows: the children that share the first child's row. */
export function columnCount(spots: readonly GridSpot[]): number {
  const first = spots[0];

  if (!first) return 0;

  let count = 0;

  for (const spot of spots) {
    if (Math.abs(spot.top - first.top) >= 1) break;

    count += 1;
  }

  return count;
}

/**
 * The offsets that move each child from where it was to where it is now, or null when the column
 * count is the same: a resize within a layout only stretches the cards, and only a change of
 * columns makes them jump.
 */
export function reflowOffsets(
  before: readonly GridSpot[],
  after: readonly GridSpot[],
): ({ x: number; y: number } | null)[] | null {
  if (columnCount(before) === columnCount(after)) return null;

  return after.map((spot, index) => {
    const from = before[index];

    if (!from) return null;

    const x = from.left - spot.left;
    const y = from.top - spot.top;

    return Math.abs(x) < 1 && Math.abs(y) < 1 ? null : { x, y };
  });
}
