import { Tooltip, TooltipContent } from "@crm/ui/components/tooltip";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";

type Hint = { element: HTMLElement; text: string };

const CELL_TAGS: ReadonlySet<string> = new Set(["TD", "TH"]);

const OPEN_DELAY_MS = 600;

const WARM_WINDOW_MS = 400;

const MAX_HINT_LENGTH = 120;

function isTruncated(element: HTMLElement): boolean {
  const style = getComputedStyle(element);

  return (
    (element.scrollWidth > element.clientWidth && style.textOverflow === "ellipsis") ||
    (element.scrollHeight > element.clientHeight && style.webkitLineClamp !== "none")
  );
}

function hintFor(target: EventTarget, container: Element): Hint | null {
  let node = target instanceof HTMLElement ? target : null;

  while (node && node !== container) {
    const text = node.textContent.trim();

    if (text && isTruncated(node)) {
      return text.length > MAX_HINT_LENGTH ? null : { element: node, text };
    }

    if (CELL_TAGS.has(node.tagName)) {
      return null;
    }

    node = node.parentElement;
  }

  return null;
}

type OverflowTooltip = {
  handlers: {
    onPointerOver: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onPointerDown: () => void;
  };
  tooltip: ReactNode;
};

export function useOverflowTooltip(): OverflowTooltip {
  const [hint, setHint] = useState<Hint | null>(null);
  const [shown, setShown] = useState<Hint | null>(null);

  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pendingElement = useRef<HTMLElement | null>(null);

  const warmUntil = useRef(0);

  if (hint && hint !== shown) {
    setShown(hint);
  }

  const cancelPending = () => {
    clearTimeout(pendingTimer.current);
    pendingTimer.current = undefined;
    pendingElement.current = null;
  };

  const close = () => {
    cancelPending();

    if (hint) {
      warmUntil.current = Date.now() + WARM_WINDOW_MS;
      setHint(null);
    }
  };

  return {
    handlers: {
      onPointerOver: (event) => {
        const next = hintFor(event.target, event.currentTarget);

        if (!next) {
          close();

          return;
        }

        if (next.element === hint?.element || next.element === pendingElement.current) {
          return;
        }

        cancelPending();

        if (hint || Date.now() < warmUntil.current) {
          setHint(next);

          return;
        }

        pendingElement.current = next.element;
        pendingTimer.current = setTimeout(() => {
          pendingTimer.current = undefined;
          pendingElement.current = null;
          setHint(next);
        }, OPEN_DELAY_MS);
      },
      onPointerLeave: close,
      onPointerDown: close,
    },
    tooltip: (
      <Tooltip
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        open={hint !== null}
      >
        <TooltipContent anchor={shown?.element} sideOffset={8}>
          {shown?.text}
        </TooltipContent>
      </Tooltip>
    ),
  };
}
