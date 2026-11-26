import inProgress16 from "@carbon/icons/es/in-progress/16.js";
import { cn } from "cn";
import { Icon, type IconProps } from "@crm/ui/components/icon";

/**
 * Indeterminate progress. Spins under reduced motion too: it signals work, not decoration.
 * Labelled, so it is exposed as an image; a busy container should also set `aria-busy`.
 */
function Spinner({ className, ...props }: Omit<IconProps, "icon">) {
  return (
    <Icon
      icon={inProgress16}
      aria-label="Loading"
      data-slot="spinner"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
