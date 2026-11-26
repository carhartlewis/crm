import { rubberBand } from "@crm/ui/lib/rubber-band";

/** Where the dragged item lands: one slot per other item whose center it has passed. */
export function slotIndex(centers: readonly number[], from: number, draggedCenter: number) {
  return centers.filter((center, index) => index !== from && center < draggedCenter).length;
}

/** How far a sibling moves to open the gap while `from` hovers over slot `to`. */
export function siblingShift(index: number, from: number, to: number, pitch: number) {
  if (from < to && index > from && index <= to) return -pitch;

  if (to < from && index >= to && index < from) return pitch;

  return 0;
}

export interface ReorderOptions {
  /** The dragged item entered a new slot (a haptic tick). */
  onSlotChange: () => void;
  /** Dropped in a new place. The only point React hears about the drag. */
  onCommit: (from: number, to: number) => void;
}

const ITEM = "[data-reorder-item]";
const DRAG_THRESHOLD = 4;
const OVERDRAG = 80;
const SETTLE = "transform 150ms var(--ease-out)";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const translate = (y: number) => (y === 0 ? "" : `translate3d(0, ${y}px, 0)`);

interface Press {
  readonly pointerId: number;
  readonly startY: number;
  readonly item: HTMLElement;
}

interface Drag {
  readonly items: HTMLElement[];
  readonly tops: number[];
  readonly centers: number[];
  readonly from: number;
  readonly min: number;
  readonly max: number;
  readonly pitch: number;
  index: number;
}

/**
 * Pointer reordering for a list whose direct children carry `data-reorder-item`. Mouse and pen
 * only (touch scrolls). While dragging there are zero React renders: the dragged item follows
 * the pointer through `transform`, siblings slide aside, and past either end it rubber-bands.
 * Escape cancels. A press that never moves stays a click.
 */
export function reorderable({ onSlotChange, onCommit }: ReorderOptions) {
  return (list: HTMLElement | null) => {
    if (!list) return;

    let press: Press | null = null;
    let drag: Drag | null = null;
    let swallowClick = false;

    const begin = (current: Press): Drag | null => {
      const items = [...list.querySelectorAll<HTMLElement>(`:scope > ${ITEM}`)];
      const from = items.indexOf(current.item);
      const rects = items.map((item) => item.getBoundingClientRect());
      const first = rects[0];
      const last = rects.at(-1);
      const own = rects[from];

      if (from < 0 || !first || !last || !own) return null;

      const second = rects[1];
      const gap = second ? second.top - first.bottom : 0;

      list.setPointerCapture(current.pointerId);
      document.body.dataset["reordering"] = "";

      const transition = reduceMotion() ? "none" : SETTLE;

      for (const item of items) item.style.transition = item === current.item ? "none" : transition;

      current.item.style.zIndex = "1";

      return {
        items,
        tops: rects.map((rect) => rect.top),
        centers: rects.map((rect) => rect.top + rect.height / 2),
        from,
        min: first.top - own.top,
        max: last.bottom - own.bottom,
        pitch: own.height + gap,
        index: from,
      };
    };

    const follow = (current: Drag, item: HTMLElement, dy: number) => {
      let y = dy;

      if (y < current.min) y = current.min + rubberBand(y - current.min, OVERDRAG);

      if (y > current.max) y = current.max + rubberBand(y - current.max, OVERDRAG);

      item.style.transform = translate(y);

      const index = slotIndex(
        current.centers,
        current.from,
        (current.centers[current.from] ?? 0) + y,
      );

      if (index === current.index) return;

      current.index = index;
      current.items.forEach((sibling, i) => {
        if (i !== current.from) {
          sibling.style.transform = translate(siblingShift(i, current.from, index, current.pitch));
        }
      });
      onSlotChange();
    };

    const finish = (current: Drag, item: HTMLElement, commit: boolean) => {
      const to = commit ? current.index : current.from;

      const done = () => {
        for (const each of current.items) {
          each.style.transform = "";
          each.style.transition = "";
          each.style.zIndex = "";
        }

        delete document.body.dataset["reordering"];

        if (to !== current.from) onCommit(current.from, to);
      };

      if (!commit) {
        for (const sibling of current.items) if (sibling !== item) sibling.style.transform = "";
      }

      if (reduceMotion()) {
        done();

        return;
      }

      // Glide into the slot, then let React reorder the DOM in the same frame the styles clear.
      item.style.transition = SETTLE;
      item.style.transform = translate((current.tops[to] ?? 0) - (current.tops[current.from] ?? 0));

      const fallback = setTimeout(done, 200);

      item.addEventListener(
        "transitionend",
        () => {
          clearTimeout(fallback);
          done();
        },
        { once: true },
      );
    };

    const end = (commit: boolean) => {
      if (press && drag) {
        if (list.hasPointerCapture(press.pointerId)) list.releasePointerCapture(press.pointerId);
        finish(drag, press.item, commit);
      }

      press = null;
      drag = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "touch") return;

      const item = event.target instanceof Element ? event.target.closest<HTMLElement>(ITEM) : null;

      if (item?.parentElement !== list) return;

      press = { pointerId: event.pointerId, startY: event.clientY, item };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (press?.pointerId !== event.pointerId) return;

      const dy = event.clientY - press.startY;

      if (!drag) {
        if (Math.abs(dy) < DRAG_THRESHOLD) return;

        drag = begin(press);

        if (!drag) {
          press = null;

          return;
        }
      }

      follow(drag, press.item, dy);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (press?.pointerId !== event.pointerId) return;

      if (drag) {
        // The release would click the link under the pointer; a drop is not a navigation.
        swallowClick = true;
        setTimeout(() => {
          swallowClick = false;
        }, 0);
      }

      end(true);
    };

    const onPointerCancel = () => end(false);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        end(false);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;

      event.preventDefault();
      event.stopPropagation();
    };

    list.addEventListener("pointerdown", onPointerDown);
    list.addEventListener("pointermove", onPointerMove);
    list.addEventListener("pointerup", onPointerUp);
    list.addEventListener("pointercancel", onPointerCancel);
    list.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      end(false);
      list.removeEventListener("pointerdown", onPointerDown);
      list.removeEventListener("pointermove", onPointerMove);
      list.removeEventListener("pointerup", onPointerUp);
      list.removeEventListener("pointercancel", onPointerCancel);
      list.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  };
}
