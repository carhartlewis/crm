import chevronRight from "@carbon/icons/es/chevron--right/16.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import { carbonIcon } from "@crm/ui/components/icon";
import { SidebarGroup, SidebarGroupLabel } from "@crm/ui/components/sidebar";
import type { ReactNode } from "react";
import { type SidebarSection, setSectionOpen, useSectionOpen } from "../../lib/sidebar-sections.ts";

const ChevronIcon = carbonIcon(chevronRight);

/**
 * A sidebar section that opens and closes from its label, as in Linear: a chevron after the
 * label shows on hover (or focus), pointing down while open and right while closed. Open by default; the choice is
 * kept per person on this device (`lib/sidebar-sections.ts`).
 */
export function NavSection({
  userId,
  section,
  label,
  action,
  children,
}: {
  userId: string;
  section: SidebarSection;
  label: string;
  /** A button at the end of the label row, such as New folder. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const open = useSectionOpen(userId, section);

  return (
    <SidebarGroup>
      <Collapsible open={open} onOpenChange={(next) => setSectionOpen(userId, section, next)}>
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="group/section w-full cursor-pointer"
        >
          <span className="flex items-center gap-1">
            {label}
            <ChevronIcon
              data-open={open || undefined}
              className="size-3.5 opacity-0 transition group-hover/section:opacity-100 group-focus-visible/section:opacity-100 data-open:rotate-90"
            />
          </span>
        </SidebarGroupLabel>
        {action}
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}
