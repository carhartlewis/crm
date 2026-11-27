import { preloadable } from "@crm/ui/lib/preloadable";
import { Suspense, type ComponentType } from "react";
import type { RecordKind } from "../../lib/records.ts";

interface SheetProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/** Each record kind's sheet. A kind without one fails type checking. */
const sheets = {
  company: preloadable(() => import("../companies/company-sheet.tsx")),
} satisfies { readonly [K in RecordKind]: ComponentType<SheetProps> };

/**
 * Every record sheet, mounted once in the shell so `?<kind>=<id>` opens it over any page (from a
 * table, ⌘K or a link). Kept mounted (closed) so a sheet animates out instead of vanishing.
 */
export function RecordSheets(props: SheetProps) {
  return (
    <Suspense fallback={null}>
      {Object.entries(sheets).map(([kind, Sheet]) => (
        <Sheet key={kind} {...props} />
      ))}
    </Suspense>
  );
}
