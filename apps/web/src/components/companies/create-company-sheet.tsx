import { Button } from "@crm/ui/components/button";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { companiesCollection, createCompanyMutation } from "../../lib/companies.ts";
import { CompanyForm } from "./company-form.tsx";

export interface CreateCompanySheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly userId: string;
  readonly workspaceId: string;
}

/**
 * New company, from anywhere (⌥⇧C, the Companies page button). Its own chunk, warmed when the
 * shell is idle, so TanStack DB loads only once a company page or this sheet needs it.
 */
export default function CreateCompanySheet({
  open,
  onOpenChange,
  userId,
  workspaceId,
}: CreateCompanySheetProps) {
  const navigate = useNavigate();

  const create = useMutation({
    ...createCompanyMutation,
    onSuccess: (id, { input }) => {
      onOpenChange(false);
      toast.success(`${input.name} added`, {
        action: {
          label: "View",
          onClick: () => void navigate({ href: `/companies?company=${encodeURIComponent(id)}` }),
        },
      });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent>
        <CompanyForm
          submitLabel="Create company"
          onSubmit={async (input) => {
            await create.mutateAsync({
              collection: companiesCollection(workspaceId),
              workspaceId,
              ownerId: userId,
              input,
            });
          }}
          secondary={
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          }
          sheet={{
            header: (
              <AdaptiveSheetHeader>
                <AdaptiveSheetTitle>New company</AdaptiveSheetTitle>
                <AdaptiveSheetDescription>
                  It appears in the list at once and syncs to your workspace.
                </AdaptiveSheetDescription>
              </AdaptiveSheetHeader>
            ),
            Footer: AdaptiveSheetFooter,
          }}
        />
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
