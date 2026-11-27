import { preloadable } from "@crm/ui/lib/preloadable";
import { Suspense } from "react";
import { useCreateSheet } from "../../lib/create-sheet.ts";

export const CreateCompanySheet = preloadable(
  () => import("../companies/create-company-sheet.tsx"),
);

/** Every create sheet, mounted once in the shell so hotkeys open them from any page. */
export function CreateSheets({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const [kind, setKind] = useCreateSheet();

  // Kept mounted (closed) so a sheet animates out instead of vanishing.
  return (
    <Suspense fallback={null}>
      <CreateCompanySheet
        open={kind === "company"}
        onOpenChange={(open) => {
          if (!open) void setKind(null);
        }}
        userId={userId}
        workspaceId={workspaceId}
      />
    </Suspense>
  );
}
