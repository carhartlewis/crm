import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const statusDotVariants = cva("inline-block size-2 shrink-0 rounded-[2px]", {
  variants: {
    tone: {
      neutral: "bg-muted-foreground",
      info: "bg-chart-2",
      warning: "bg-chart-1",
      success: "bg-success",
      error: "bg-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type StatusTone = NonNullable<VariantProps<typeof statusDotVariants>["tone"]>;

/** A small square in a status colour, before a label such as a deal stage. */
export function StatusDot({
  tone,
  className,
}: { className?: string } & VariantProps<typeof statusDotVariants>) {
  return <span aria-hidden className={cn(statusDotVariants({ tone }), className)} />;
}
