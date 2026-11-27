import { cn } from "cn";

/** The colours a space can have: `SPACE_COLORS` in `@crm/core/chat`, plus Private. */
export type SpaceDotColor = "private" | "blue" | "orange" | "green" | "purple" | "pink" | "gray";

/**
 * A chat space's colour: a small rounded square before its name, as in Glass. The colours are
 * theme tokens in globals.css (`[data-slot="space-dot"]`), one rule each.
 */
function SpaceDot({
  color = "gray",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "color"> & { color?: SpaceDotColor }) {
  return (
    <span
      aria-hidden
      data-slot="space-dot"
      data-color={color}
      className={cn("inline-block size-2.5 shrink-0 rounded-sm select-none", className)}
      {...props}
    />
  );
}

export { SpaceDot };
