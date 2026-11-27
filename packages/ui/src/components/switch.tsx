"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/*
 * The track's checked colour is a `before:` layer that fades in, and the thumb slides with
 * `transform`: only opacity and transform animate. Under reduced motion the thumb jumps and the
 * colour still fades.
 */
const switchVariants = cva(
  "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input outline-none select-none before:absolute before:-inset-px before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity before:duration-150 before:ease-out after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:before:opacity-100 data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default: "h-[18px] w-8",
        sm: "h-3.5 w-6",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const thumbVariants = cva(
  "pointer-events-none relative block rounded-full bg-background shadow-sm ring-0 transition-transform duration-150 ease-out motion-reduce:transition-none data-checked:translate-x-[calc(100%-2px)] dark:bg-foreground dark:data-checked:bg-primary-foreground",
  {
    variants: {
      size: {
        default: "size-4",
        sm: "size-3",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type SwitchProps = SwitchPrimitive.Root.Props & VariantProps<typeof switchVariants>;

function Switch({ className, size = "default", ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(switchVariants({ size }), className)}
      data-size={size}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb className={thumbVariants({ size })} data-slot="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export { Switch, switchVariants };
