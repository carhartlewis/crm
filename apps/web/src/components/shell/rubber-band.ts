/**
 * Apple's rubber-band curve: displacement grows slower the further you pull, approaching
 * `dimension`. c = 0.55 matches UIScrollView.
 */
export function rubberBand(offset: number, dimension: number, c = 0.55) {
  if (dimension <= 0) return 0;

  return (1 - 1 / ((Math.abs(offset) * c) / dimension + 1)) * dimension * Math.sign(offset);
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Callback ref for a scroll container: pulling past either end (wheel or trackpad) stretches
 * the first child with resistance, and letting go springs it back. Native overscroll is off
 * (`overscroll-none` on the container) so the two don't fight. Style writes only: no renders.
 * With reduced motion the edge simply stops.
 */
export function rubberBandScroll(scroller: HTMLElement | null) {
  if (!scroller) return;

  let overscroll = 0;
  let release: ReturnType<typeof setTimeout> | undefined;

  const content = () =>
    scroller.firstElementChild instanceof HTMLElement ? scroller.firstElementChild : null;

  const settle = () => {
    const target = content();

    overscroll = 0;

    if (!target) return;

    target.style.transition = "transform 300ms var(--ease-out)";
    target.style.transform = "";
  };

  const onWheel = (event: WheelEvent) => {
    // Pinch-zoom arrives as ctrl+wheel; horizontal swipes are for history navigation.
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || reduceMotion()) return;

    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

    const pulling =
      overscroll !== 0 || (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom);

    const target = content();

    if (!pulling || !target) return;

    event.preventDefault();

    const next = overscroll - event.deltaY;

    // Pushing back through the resting point hands control back to normal scrolling.
    overscroll = Math.sign(next) !== Math.sign(overscroll) && overscroll !== 0 ? 0 : next;
    target.style.transition = "none";
    target.style.transform = `translate3d(0, ${rubberBand(overscroll, scroller.clientHeight)}px, 0)`;

    clearTimeout(release);
    // Wheel events have no "finger lifted": a short gap in them is the release.
    release = setTimeout(settle, 90);
  };

  scroller.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    clearTimeout(release);
    scroller.removeEventListener("wheel", onWheel);
  };
}
