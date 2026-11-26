/** App mark: a soft tile with a single sweep, echoing the welcome backdrop. */
export function AppMark() {
  return (
    <div className="flex size-20 items-center justify-center rounded-3xl bg-card shadow-xl ring-1 ring-border">
      <svg viewBox="0 0 48 48" className="size-11 text-foreground" aria-hidden>
        <path
          d="M10 36c9-2 19-10 24-24"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path d="M27 36h11L33 27z" fill="currentColor" />
      </svg>
    </div>
  );
}
