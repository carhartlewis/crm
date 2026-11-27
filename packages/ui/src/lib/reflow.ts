/**
 * Marks the document while its layout reflows from a width change (a window resize, the sidebar
 * opening or being dragged): `data-reflowing` on the root, cleared shortly after the last change.
 * Narrow switches (`wide-only`, `narrow-only` in globals.css) fade in only then, never when a
 * page or table first mounts.
 */
const SETTLE_MS = 300;

type Schedule<Handle> = {
  set: (run: () => void, ms: number) => Handle;
  clear: (handle: Handle | undefined) => void;
};

const timers: Schedule<ReturnType<typeof setTimeout>> = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle),
};

/** Where the mark goes: the document's root element, or a stand-in in tests. */
export type ReflowRoot = { dataset: Record<string, string | undefined> };

export function reflowMarker<Handle>(root: ReflowRoot, schedule: Schedule<Handle>) {
  let pending: Handle | undefined;

  return function mark() {
    root.dataset.reflowing = "";
    schedule.clear(pending);
    pending = schedule.set(() => {
      delete root.dataset.reflowing;
    }, SETTLE_MS);
  };
}

let mark: (() => void) | undefined;

/** One marker per document; a window resize marks it before that frame's style is computed. */
function documentMarker() {
  if (!mark) {
    mark = reflowMarker(document.documentElement, timers);
    window.addEventListener("resize", mark, { passive: true });
  }

  return mark;
}

/**
 * A ref callback: marks a reflow whenever the element's width changes after its first layout,
 * which covers the sidebar, whose width changes without a window resize.
 */
export function observeReflow(element: HTMLElement | null) {
  if (!element) return;

  const markReflow = documentMarker();
  let width: number | null = null;

  const observer = new ResizeObserver(([entry]) => {
    const next = entry?.contentRect.width ?? 0;

    // Marked on the next frame: writing to the document inside a ResizeObserver callback restyles
    // the page mid-loop, which the browser reports as an undelivered-notifications error.
    if (width !== null && Math.abs(next - width) >= 1) requestAnimationFrame(markReflow);

    width = next;
  });

  // The border box: a scrollbar coming or going is not a width change.
  observer.observe(element, { box: "border-box" });

  return () => observer.disconnect();
}
