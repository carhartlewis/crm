import { connectorNameError, connectorUrlError } from "@crm/integrations";
import { Button } from "@crm/ui/components/button";
import { FieldGroup } from "@crm/ui/components/field";
import {
  AdaptiveSheet,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
} from "@crm/ui/patterns/adaptive-sheet";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { addConnectorMutation } from "../../lib/connections.ts";
import { TextField } from "../text-field.tsx";

/**
 * Add any remote MCP server to the workspace by URL. The API checks that it offers MCP OAuth
 * before saving; each person then connects to it from its card, as with the built-in apps.
 */
export function AddConnectorSheet({ onClose }: { onClose: () => void }) {
  const add = useMutation({
    ...addConnectorMutation,
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { name: "", url: "" },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      const connector = await add.mutateAsync(value).catch(() => null);

      if (!connector) return;

      toast(`${connector.name} is added. Connect it from its card.`);
      onClose();
    },
  });

  return (
    <AdaptiveSheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AdaptiveSheetContent>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <AdaptiveSheetHeader>
            <AdaptiveSheetTitle>Add a connector</AdaptiveSheetTitle>
            <AdaptiveSheetDescription>
              Any remote MCP server that supports sign-in. Everyone in the workspace can then
              connect to it.
            </AdaptiveSheetDescription>
          </AdaptiveSheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <form.Field
                name="name"
                validators={{ onDynamic: ({ value }) => connectorNameError(value) }}
              >
                {(field) => (
                  <TextField field={field} label="Name" placeholder="Linear" autoComplete="off" />
                )}
              </form.Field>
              <form.Field
                name="url"
                validators={{ onDynamic: ({ value }) => connectorUrlError(value) }}
              >
                {(field) => (
                  <TextField
                    field={field}
                    label="Server URL"
                    placeholder="https://mcp.linear.app/mcp"
                    inputMode="url"
                    autoComplete="off"
                    description="The MCP endpoint, from the app's docs."
                  />
                )}
              </form.Field>
            </FieldGroup>
          </div>
          <AdaptiveSheetFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(submitting) => (
                  <Button type="submit" loading={submitting}>
                    Add connector
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </AdaptiveSheetFooter>
        </form>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
