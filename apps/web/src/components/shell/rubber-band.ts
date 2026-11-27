import { rubberBand } from "@crm/ui/lib/rubber-band";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How far the content can stretch past an edge, in px: a hint of give, not a second page. */
const MAX_STRETCH = 48;

/** A pause this long in wheel events counts as letting go. */
const RELEASE_GAP_MS = 50;

/** How long the content takes to spring back once let go. */
const SPRING_BACK_MS = 180;

/**
 * Callback ref for a scroll container: pulling past either end (wheel or trackpad) stretches
 * all of its content with resistance, and letting go springs it back. Every child moves as one;
 * moving only the first would slide it over the rest. Only when the content
 * overflows: a list that fits stays still. Native overscroll is off
 * (`overscroll-none` on the container) so the two don't fight. Style writes only: no renders.
 * With reduced motion the edge simply stops.
 */
export function rubberBandScroll(scroller: HTMLElement | null) {
  if (!scroller) return;

  let overscroll = 0;
  let release: ReturnType<typeof setTimeout> | undefined;

  const content = () =>
    [...scroller.children].filter((child): child is HTMLElement => child instanceof HTMLElement);

  const move = (transform: string, transition: string) => {
    for (const child of content()) {
      child.style.transition = transition;
      child.style.transform = transform;
    }
  };

  const settle = () => {
    overscroll = 0;
    move("", `transform ${SPRING_BACK_MS}ms var(--ease-out)`);
  };

  const onWheel = (event: WheelEvent) => {
    // Pinch-zoom arrives as ctrl+wheel; horizontal swipes are for history navigation.
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || reduceMotion()) return;

    // Content that fits has nothing to scroll, so it doesn't stretch either.
    if (overscroll === 0 && scroller.scrollHeight <= scroller.clientHeight + 1) return;

    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

    const pulling =
      overscroll !== 0 || (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom);

    if (!pulling || content().length === 0) return;

    event.preventDefault();

    const next = overscroll - event.deltaY;

    // Pushing back through the resting point hands control back to normal scrolling.
    overscroll = Math.sign(next) !== Math.sign(overscroll) && overscroll !== 0 ? 0 : next;
    move(`translate3d(0, ${rubberBand(overscroll, MAX_STRETCH)}px, 0)`, "none");

    clearTimeout(release);
    // Wheel events have no "finger lifted": a short gap in them is the release.
    release = setTimeout(settle, RELEASE_GAP_MS);
  };

  scroller.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    clearTimeout(release);
    scroller.removeEventListener("wheel", onWheel);
  };
}
