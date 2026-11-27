import { preloadable } from "@crm/ui/lib/preloadable";
import { RecordSheetHost } from "@crm/ui/patterns/record-sheet/record-sheet";
import { Suspense, type ComponentType } from "react";
import {
  isRecordKind,
  type RecordKind,
  useRecordStack,
  useShownRecord,
} from "../../lib/records.ts";

interface SheetProps {
  readonly userId: string;
  readonly workspaceId: string;
}

/** Each record kind's sheet. A kind without one fails type checking. */
const sheets = {
  company: preloadable(() => import("../companies/company-sheet.tsx")),
  contact: preloadable(() => import("../contacts/contact-sheet.tsx")),
  deal: preloadable(() => import("../deals/deal-sheet.tsx")),
} satisfies { readonly [K in RecordKind]: ComponentType<SheetProps> };

// Only the record on top renders, so warm every kind's chunk with the shell: a record opened
// from another then swaps in at once instead of leaving the sheet empty while it loads.
for (const sheet of Object.values(sheets)) void sheet.preload();

/**
 * The record sheet, mounted once in the shell so `?sheet=<kind>:<id>` opens it over any page (from
 * a table, ⌘K or a link). One sheet frame holds the record on top of the stack: moving from one
 * record to another swaps its content in place, and the frame slides only when the first record
 * opens or the last one closes. Kept mounted (closed) so it animates out instead of vanishing.
 */
export function RecordSheets(props: SheetProps) {
  const stack = useRecordStack();
  const shown = useShownRecord(stack);
  const Sheet = shown && isRecordKind(shown.kind) ? sheets[shown.kind] : undefined;

  return (
    <RecordSheetHost onClose={stack.pop} open={stack.entries.length > 0}>
      <Suspense fallback={null}>
        {Sheet && shown ? <Sheet key={`${shown.kind}:${shown.id}`} {...props} /> : null}
      </Suspense>
    </RecordSheetHost>
  );
}
