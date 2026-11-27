const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How far the content can stretch past an edge, in px: a hint of give, as on macOS. */
const MAX_STRETCH = 72;

/** The spring that pulls the content back (per s²); damped critically, so it never wobbles. */
const STIFFNESS = 130;
const DAMPING = 2 * Math.sqrt(STIFFNESS);

/** Velocity (px/s) each pixel of wheel delta past the edge adds. */
const IMPULSE = 60;

/** A pause this long in wheel events starts a new gesture. */
const GESTURE_GAP_MS = 50;

/**
 * Trackpad momentum fades: each step is a share of the one before. A step this much smaller
 * than the largest one in the gesture means the finger is off the trackpad.
 */
const MOMENTUM_SHARE = 0.7;

/**
 * Callback ref for a scroll container: its ends give a little, as on macOS. Wheel steps past an
 * edge push the content, with more resistance the further it goes, and a spring pulls it back.
 * Like macOS, momentum that reaches an edge makes one bounce and the rest is dropped; any other
 * wheel event scrolls normally, at once. Chromium bounces only the page itself, not inner
 * scrollers, hence this. Every child moves as one; only when the content overflows; style
 * writes on animation frames, no renders. With reduced motion the edge simply stops.
 */
export function rubberBandScroll(scroller: HTMLElement | null) {
  if (!scroller) return;

  let offset = 0;
  let velocity = 0;
  let frame = 0;
  let last = 0;
  let lastEvent = 0;
  // The largest step in this gesture, and whether its finger has lifted (momentum continues).
  let largest = 0;
  let released = false;

  const paint = () => {
    const transform = offset === 0 ? "" : `translate3d(0, ${offset.toFixed(2)}px, 0)`;

    for (const child of scroller.children) {
      if (child instanceof HTMLElement) child.style.transform = transform;
    }
  };

  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);

    last = now;
    velocity += (-STIFFNESS * offset - DAMPING * velocity) * dt;
    offset += velocity * dt;

    if (Math.abs(offset) < 0.25 && Math.abs(velocity) < 5) {
      offset = 0;
      velocity = 0;
      frame = 0;
      paint();

      return;
    }

    paint();
    frame = requestAnimationFrame(step);
  };

  const onWheel = (event: WheelEvent) => {
    // Pinch-zoom arrives as ctrl+wheel; horizontal swipes are for history navigation.
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || reduceMotion()) return;

    // Content that fits has nothing to scroll, so it doesn't stretch either.
    if (scroller.scrollHeight <= scroller.clientHeight + 1) return;

    if (event.timeStamp - lastEvent > GESTURE_GAP_MS) {
      largest = 0;
      released = false;
    }

    lastEvent = event.timeStamp;

    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    const pastEdge = (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom);

    if (!pastEdge) return;

    // The edge stops these anyway; taking them keeps the page from moving instead.
    event.preventDefault();

    const size = Math.abs(event.deltaY);

    if (largest > 0 && size < largest * MOMENTUM_SHARE) released = true;

    if (released) return;

    largest = Math.max(largest, size);

    // Linear resistance: soft at first, firm only near the limit.
    const resistance = Math.max(0, 1 - Math.abs(offset) / MAX_STRETCH);

    velocity -= event.deltaY * IMPULSE * resistance;

    if (frame === 0) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  };

  scroller.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    cancelAnimationFrame(frame);
    scroller.removeEventListener("wheel", onWheel);
  };
}
