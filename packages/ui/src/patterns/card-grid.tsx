import { cn } from "cn";
import { type ReactNode, useCallback } from "react";
import { type GridSpot, reflowOffsets } from "@crm/ui/lib/grid-reflow";

const REFLOW_MS = 200;

function spotsOf(grid: HTMLElement): GridSpot[] {
  return [...grid.children].map((child) =>
    child instanceof HTMLElement
      ? { left: child.offsetLeft, top: child.offsetTop }
      : { left: 0, top: 0 },
  );
}

/**
 * Cards in `grid-cols-cards`. When the grid's width changes its column count, the cards glide
 * from their old places to their new ones (transform only, the codebase's `ease-in-out`), so they
 * don't jump. Within a layout the cards just stretch. No React renders: a ResizeObserver and WAAPI.
 * Reduced motion moves them at once.
 */
export function CardGrid({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useCallback((grid: HTMLDivElement | null) => {
    if (!grid) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let before = spotsOf(grid);

    const observer = new ResizeObserver(() => {
      const after = spotsOf(grid);
      const offsets = reduced.matches ? null : reflowOffsets(before, after);

      before = after;

      if (!offsets) return;

      const easing =
        getComputedStyle(grid).getPropertyValue("--ease-in-out").trim() || "ease-in-out";

      offsets.forEach((offset, index) => {
        const card = grid.children[index];

        if (!offset || !(card instanceof HTMLElement)) return;

        card.animate(
          [{ transform: `translate(${offset.x}px, ${offset.y}px)` }, { transform: "none" }],
          { duration: REFLOW_MS, easing },
        );
      });
    });

    observer.observe(grid);

    return () => observer.disconnect();
  }, []);

  // `relative` makes the grid the cards' offset parent, so their spots ignore running transforms.
  return (
    <div ref={ref} className={cn("relative grid grid-cols-cards gap-3", className)}>
      {children}
    </div>
  );
}
