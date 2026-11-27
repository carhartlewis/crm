import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { carbonIcon } from "./icon";

const ChevronIcon = carbonIcon(chevronDown16);

/**
 * A form field that opens a menu or a searchable list: looks like `Input`, with a chevron. Pass it
 * as a menu or popover trigger's `render`. `placeholder` shows while nothing is chosen.
 */
export function SelectField({
  className,
  children,
  placeholder,
  ...props
}: ComponentProps<"button"> & { placeholder?: string }) {
  const empty = children === null || children === undefined || children === false;

  return (
    <button
      className={cn(
        "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-base outline-none transition-colors select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30",
        className,
      )}
      data-slot="select-field"
      type="button"
      {...props}
    >
      <span
        className="flex min-w-0 items-center gap-2 truncate data-[empty]:text-muted-foreground"
        data-empty={empty || undefined}
      >
        {empty ? placeholder : children}
      </span>
      <ChevronIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
