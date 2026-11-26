import { rubberBand } from "@crm/ui/lib/rubber-band";

/** Sidebar width limits and the magnetic default, in CSS pixels. */
export const SIDEBAR_WIDTH = { min: 200, max: 400, default: 256 } as const;

/** Drag this far past the minimum and the sidebar collapses; come back past the hysteresis to reopen. */
export const COLLAPSE_DISTANCE = 56;
const REOPEN_HYSTERESIS = 16;
const SNAP_DISTANCE = 6;
const OVERDRAG = 48;

export type WidthZone = "free" | "default" | "min" | "max";

export interface ResolvedWidth {
  readonly width: number;
  readonly zone: WidthZone;
}

/**
 * Where a raw dragged width (start width + pointer travel) lands: inside the limits it follows
 * the pointer, within a few pixels of the default it sticks there, and past a limit it resists.
 */
export function resolveSidebarWidth(raw: number): ResolvedWidth {
  const { min, max } = SIDEBAR_WIDTH;

  if (raw < min) return { width: min + rubberBand(raw - min, OVERDRAG), zone: "min" };

  if (raw > max) return { width: max + rubberBand(raw - max, OVERDRAG), zone: "max" };

  if (Math.abs(raw - SIDEBAR_WIDTH.default) <= SNAP_DISTANCE) {
    return { width: SIDEBAR_WIDTH.default, zone: "default" };
  }

  return { width: raw, zone: "free" };
}

/** Whether the drag should collapse (or reopen) the sidebar, with hysteresis so it doesn't flicker. */
export function nextOpenState(raw: number, open: boolean) {
  const threshold = SIDEBAR_WIDTH.min - COLLAPSE_DISTANCE;

  return open ? raw >= threshold : raw > threshold + REOPEN_HYSTERESIS;
}

/** The width that's kept when the drag ends: clamped, or the default if it stuck there. */
export function settledWidth(raw: number) {
  const { width, zone } = resolveSidebarWidth(raw);

  if (zone === "min") return SIDEBAR_WIDTH.min;

  if (zone === "max") return SIDEBAR_WIDTH.max;

  return Math.round(width);
}

/** A stored width, if it's a number inside the limits. */
export function parseSidebarWidth(value: string | undefined) {
  const width = Number(value);

  return Number.isFinite(width) && width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max
    ? width
    : undefined;
}
