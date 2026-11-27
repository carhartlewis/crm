import { cn } from "cn";

/**
 * A 5 by 5 grid of dots that brighten from the center out, for agent work that is running (as in
 * comp-neo). It is 14px, the size of a small icon, so it stands where a check goes when the step
 * ends. Reduced motion keeps the dots still at half strength. `Spinner` stays the waiting mark for
 * buttons; this is for the agent's work.
 */
const GRID = 5;

const CENTER = (GRID - 1) / 2;

/** Each band of dots starts later than the one inside it: a quarter cycle, then half. */
const RING_DELAY_MS = [0, 350, 700] as const;

const DOTS = Array.from({ length: GRID * GRID }, (_, index) => {
  const band = Math.max(
    Math.abs(Math.floor(index / GRID) - CENTER),
    Math.abs((index % GRID) - CENTER),
  );

  return { index, delay: `${RING_DELAY_MS[band] ?? 0}ms` };
});

export function DotMatrix({
  label = "Working",
  decorative = false,
  still = false,
  className,
}: {
  /** What a screen reader hears, when the dots stand alone. */
  label?: string;
  /** Hidden from screen readers, because the text beside it says the same. */
  decorative?: boolean;
  /** Paused at half strength, such as while the agent waits for an approval. */
  still?: boolean;
  /** Layout only. */
  className?: string;
}) {
  return (
    <span
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      role={decorative ? undefined : "img"}
      data-slot="dot-matrix"
      className={cn(
        "grid size-3.5 shrink-0 grid-cols-5 grid-rows-5 place-items-center text-current",
        className,
      )}
    >
      {DOTS.map((dot) => (
        <span
          key={dot.index}
          className={cn(
            "size-0.5 rounded-full bg-current",
            still ? "opacity-50" : "animate-dot-matrix opacity-20",
          )}
          style={still ? undefined : { animationDelay: dot.delay }}
        />
      ))}
    </span>
  );
}

/** "Thinking", with the dots, while the agent works on a reply before its first words. */
export function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    <output
      data-slot="thinking-indicator"
      className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground select-none"
    >
      <DotMatrix decorative />
      <span className="text-shimmer">{label}</span>
    </output>
  );
}
