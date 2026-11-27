import { preloadable } from "@crm/ui/lib/preloadable";
import { useQueryStates, parseAsString, parseAsStringLiteral } from "nuqs";
import { Suspense } from "react";
import { CREATE_KINDS } from "../../lib/create-sheet.ts";

export const CreateCompanySheet = preloadable(
  () => import("../companies/create-company-sheet.tsx"),
);

export const CreateContactSheet = preloadable(() => import("../contacts/create-contact-sheet.tsx"));

export const CreateDealSheet = preloadable(() => import("../deals/create-deal-sheet.tsx"));

export const CreateSpaceSheet = preloadable(() => import("../chat/create-space-sheet.tsx"));

/** Every create sheet, mounted once in the shell so hotkeys open them from any page. */
export function CreateSheets({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const [{ create: kind }, set] = useQueryStates({
    create: parseAsStringLiteral(CREATE_KINDS),
    createFor: parseAsString,
  });

  // Closing clears the record a new contact or deal was for, too.
  const sheet = (open: boolean) => ({
    open,
    onOpenChange: (next: boolean) => {
      if (!next) void set({ create: null, createFor: null });
    },
    userId,
    workspaceId,
  });

  // Kept mounted (closed) so a sheet animates out instead of vanishing.
  return (
    <Suspense fallback={null}>
      <CreateCompanySheet {...sheet(kind === "company")} />
      <CreateContactSheet {...sheet(kind === "contact")} />
      <CreateDealSheet {...sheet(kind === "deal")} />
      <CreateSpaceSheet {...sheet(kind === "space")} />
    </Suspense>
  );
}
