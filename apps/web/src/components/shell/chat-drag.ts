import { setReordering } from "./reorder.ts";

/** Where a dragged chat can land. */
export type ChatDrop =
  | { readonly kind: "pinned"; readonly index: number }
  | { readonly kind: "folder"; readonly id: string }
  | { readonly kind: "space"; readonly id: string };

export interface PinSlot {
  /** The row's place in the whole pinned order. */
  readonly pinIndex: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * The place in the pinned order for a drop at `y`: before the first row whose middle is below
 * the pointer, else after the last row. Null when there are no rows.
 */
export function pinnedInsertIndex(rows: readonly PinSlot[], y: number) {
  const before = rows.find((row) => y < (row.top + row.bottom) / 2);

  if (before) return before.pinIndex;

  const last = rows.at(-1);

  return last ? last.pinIndex + 1 : null;
}

/** Whether two targets are the same place (a new one ticks). */
export function sameDrop(a: ChatDrop | null, b: ChatDrop | null) {
  if (a === null || b === null) return a === b;

  if (a.kind === "pinned") return b.kind === "pinned" && a.index === b.index;

  return b.kind === a.kind && b.id === a.id;
}

export interface ChatDragOptions {
  /** The drop target or slot changed (a haptic tick). */
  onTargetChange: () => void;
  /** Dropped on a target. The only point React hears about the drag. */
  onDrop: (chatId: string, drop: ChatDrop) => void;
}

/**
 * Data attributes the sidebar puts on its rows:
 * - `data-drag-chat="<id>"` (with `data-chat-space` and `data-chat-folder`): a chat to drag.
 * - `data-drop-pinned`: the Pinned list; its rows carry `data-pin-index`.
 * - `data-drop-folder="<id>"`, `data-drop-space="<id>"`: rows a chat can be dropped on.
 */
const SOURCE = "[data-drag-chat]";
const DRAG_THRESHOLD = 4;

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Press {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly row: HTMLElement;
}

interface Drag {
  readonly chatId: string;
  readonly spaceId: string;
  readonly folderId: string;
  readonly ghost: HTMLElement;
  drop: ChatDrop | null;
  marked: HTMLElement | null;
}

/**
 * Drag a chat from Recents or a folder onto Pinned (between pins), a folder, or a joined space.
 * Mouse and pen only. While dragging there are zero React renders: a copy of the row follows the
 * pointer, the target row or the slot line is marked through data attributes, and each new
 * target ticks. Escape or a drop outside a target puts it back. A press that never moves stays
 * a click.
 */
export function chatDragDrop({ onTargetChange, onDrop }: ChatDragOptions) {
  return (root: HTMLElement | null) => {
    if (!root) return;

    let press: Press | null = null;
    let drag: Drag | null = null;
    let swallowClick = false;

    const mark = (current: Drag, element: HTMLElement | null, value: string) => {
      if (current.marked && current.marked !== element) delete current.marked.dataset["dropMark"];

      current.marked = element;

      if (element) element.dataset["dropMark"] = value;
    };

    /** The target under the pointer, if this chat may land there. */
    const targetAt = (
      current: Drag,
      x: number,
      y: number,
    ): [ChatDrop, HTMLElement, string] | null => {
      const under = document.elementFromPoint(x, y);

      if (!(under instanceof Element) || !root.contains(under)) return null;

      const folder = under.closest<HTMLElement>("[data-drop-folder]");
      const folderId = folder?.dataset["dropFolder"];

      if (folder && folderId) {
        return folderId === current.folderId
          ? null
          : [{ kind: "folder", id: folderId }, folder, "on"];
      }

      const space = under.closest<HTMLElement>("[data-drop-space]");
      const spaceId = space?.dataset["dropSpace"];

      if (space && spaceId) {
        return spaceId === current.spaceId ? null : [{ kind: "space", id: spaceId }, space, "on"];
      }

      const list = under.closest<HTMLElement>("[data-drop-pinned]");

      if (!list) return null;

      const rows = [...list.querySelectorAll<HTMLElement>(":scope > [data-pin-index]")];

      const slots = rows.map((row) => {
        const rect = row.getBoundingClientRect();

        return {
          row,
          pinIndex: Number(row.dataset["pinIndex"]),
          top: rect.top,
          bottom: rect.bottom,
        };
      });

      const index = pinnedInsertIndex(slots, y);
      const before = slots.find((slot) => slot.pinIndex === index);
      const line = before ?? slots.at(-1);

      if (index === null || !line) return null;

      return [{ kind: "pinned", index }, line.row, before ? "before" : "after"];
    };

    const begin = (current: Press): Drag | null => {
      const chatId = current.row.dataset["dragChat"];

      const source =
        current.row.querySelector<HTMLElement>("[data-sidebar='menu-button']") ?? current.row;

      if (!chatId) return null;

      const rect = source.getBoundingClientRect();
      const ghost = source.cloneNode(true);

      if (!(ghost instanceof HTMLElement)) return null;

      Object.assign(ghost.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        pointerEvents: "none",
        zIndex: "50",
        opacity: "0.9",
      });
      ghost.dataset["dragGhost"] = "";
      document.body.append(ghost);
      current.row.dataset["dragging"] = "";
      root.setPointerCapture(current.pointerId);
      setReordering(true);

      return {
        chatId,
        spaceId: current.row.dataset["chatSpace"] ?? "",
        folderId: current.row.dataset["chatFolder"] ?? "",
        ghost,
        drop: null,
        marked: null,
      };
    };

    const follow = (current: Drag, x: number, y: number, origin: Press) => {
      current.ghost.style.transform = `translate3d(${x - origin.startX}px, ${y - origin.startY}px, 0)`;

      const found = targetAt(current, x, y);
      const drop = found?.[0] ?? null;

      mark(current, found?.[1] ?? null, found?.[2] ?? "");

      if (sameDrop(drop, current.drop)) return;

      current.drop = drop;

      if (drop) onTargetChange();
    };

    const end = (commit: boolean) => {
      const current = { press, drag };

      press = null;
      drag = null;

      if (!current.press || !current.drag) return;

      if (root.hasPointerCapture(current.press.pointerId)) {
        root.releasePointerCapture(current.press.pointerId);
      }

      const { drag: done, press: origin } = current;
      const drop = commit ? done.drop : null;

      mark(done, null, "");
      delete origin.row.dataset["dragging"];
      setReordering(false);

      if (drop) {
        done.ghost.remove();
        onTargetChange();
        onDrop(done.chatId, drop);

        return;
      }

      // Nowhere to land: the copy glides back to its row, then goes.
      if (reduceMotion()) {
        done.ghost.remove();

        return;
      }

      done.ghost.style.transition =
        "transform 150ms var(--ease-out), opacity 150ms var(--ease-out)";
      done.ghost.style.transform = "";
      done.ghost.style.opacity = "0";
      setTimeout(() => done.ghost.remove(), 160);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "touch") return;

      const row =
        event.target instanceof Element ? event.target.closest<HTMLElement>(SOURCE) : null;

      // The row's hover actions (pin) are buttons of their own, not handles.
      if (
        !row ||
        (event.target instanceof Element && event.target.closest("[data-sidebar='menu-action']"))
      ) {
        return;
      }

      press = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, row };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (press?.pointerId !== event.pointerId) return;

      if (!drag) {
        if (
          Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD
        ) {
          return;
        }

        drag = begin(press);

        if (!drag) {
          press = null;

          return;
        }
      }

      follow(drag, event.clientX, event.clientY, press);
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

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerCancel);
    root.addEventListener("lostpointercapture", onPointerCancel);
    root.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onPointerCancel);

    return () => {
      end(false);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("lostpointercapture", onPointerCancel);
      root.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onPointerCancel);
    };
  };
}
