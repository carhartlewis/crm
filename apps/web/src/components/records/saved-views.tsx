import bookmark16 from "@carbon/icons/es/bookmark/16.js";
import checkmark16 from "@carbon/icons/es/checkmark/16.js";
import chevronDown16 from "@carbon/icons/es/chevron--down/16.js";
import { canEditView, type SavedViewEntity, viewName } from "@crm/core/views";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { carbonIcon } from "@crm/ui/components/icon";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  listQuery,
  newSavedView,
  type SavedView,
  savedViewsCollection,
  useSavedViews,
  withListQuery,
} from "../../lib/saved-views.ts";
import { deleteRecords, saveRecord } from "../../lib/synced-records.ts";
import { TextField } from "../text-field.tsx";

const BookmarkIcon = carbonIcon(bookmark16);
const CheckIcon = carbonIcon(checkmark16);
const ChevronIcon = carbonIcon(chevronDown16);

export interface SavedViewsMenuProps {
  readonly entity: SavedViewEntity;
  readonly workspaceId: string;
  readonly userId: string;
  /** The URL keys the list owns (`listKeys`). */
  readonly keys: ReadonlySet<string>;
}

type Editing = { mode: "create" } | { mode: "rename"; view: SavedView };

/**
 * The list toolbar's Views menu: apply a saved view (its query goes into the URL), save the
 * current filters as a view, update, rename or delete the view in use.
 */
export function SavedViewsMenu({ entity, workspaceId, userId, keys }: SavedViewsMenuProps) {
  const router = useRouter();
  const location = useLocation({ select: (at) => ({ path: at.pathname, search: at.searchStr }) });
  const views = useSavedViews(workspaceId, entity);
  const collection = savedViewsCollection(workspaceId);
  const [editing, setEditing] = useState<Editing | null>(null);

  const current = listQuery(location.search, keys);
  const active = views.find((view) => view.query === current) ?? null;

  const canEdit =
    active !== null && canEditView({ shared: active.shared, ownerId: active.owner_id }, userId);

  const apply = (query: string) =>
    router.history.push(`${location.path}${withListQuery(location.search, keys, query)}`);

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SavedView> }) =>
      saveRecord(collection, id, patch),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (view: SavedView) => deleteRecords(collection, [view.id]),
    onSuccess: () => toast.success("View deleted"),
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button className="justify-start @2xl:justify-center" variant="outline" />}
        >
          <BookmarkIcon />
          <span className="truncate">{active?.name ?? "Views"}</span>
          <ChevronIcon className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {views.length > 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Saved views</DropdownMenuLabel>
              {views.map((view) => (
                <DropdownMenuItem key={view.id} onClick={() => apply(view.query)}>
                  <span className="flex size-4 shrink-0 items-center">
                    {view.id === active?.id ? <CheckIcon /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{view.name}</span>
                  {view.shared ? (
                    <span className="shrink-0 text-muted-foreground text-xs">Shared</span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditing({ mode: "create" })}>
            Save current view…
          </DropdownMenuItem>
          {active && canEdit ? (
            <>
              <DropdownMenuItem onClick={() => setEditing({ mode: "rename", view: active })}>
                {`Rename “${active.name}”…`}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => remove.mutate(active)} variant="destructive">
                {`Delete “${active.name}”`}
              </DropdownMenuItem>
            </>
          ) : null}
          {current ? (
            <DropdownMenuItem onClick={() => apply("")}>Clear filters</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={(open) => !open && setEditing(null)} open={editing !== null}>
        <DialogContent>
          {editing ? (
            <ViewForm
              editing={editing}
              key={editing.mode === "rename" ? editing.view.id : "create"}
              onDone={() => setEditing(null)}
              onSubmit={async ({ name, shared }) => {
                if (editing.mode === "rename") {
                  const patch: Partial<SavedView> =
                    editing.view.owner_id === userId ? { name, shared } : { name };

                  await save.mutateAsync({ id: editing.view.id, patch });
                  toast.success("View saved");

                  return;
                }

                await collection
                  .insert(
                    newSavedView(workspaceId, userId, { entity, name, shared, query: current }),
                  )
                  .when("settled");
                toast.success(`Saved “${name}”`);
              }}
              owner={editing.mode === "create" || editing.view.owner_id === userId}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ViewForm({
  editing,
  owner,
  onSubmit,
  onDone,
}: {
  editing: Editing;
  /** Only a view's owner decides who sees it. */
  owner: boolean;
  onSubmit: (values: { name: string; shared: boolean }) => Promise<void>;
  onDone: () => void;
}) {
  const formId = useId();
  const sharedId = useId();
  const view = editing.mode === "rename" ? editing.view : null;

  const submit = useMutation({
    mutationFn: onSubmit,
    onSuccess: onDone,
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { name: view?.name ?? "", shared: view?.shared ?? false },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      await submit
        .mutateAsync({ name: value.name.trim(), shared: value.shared })
        .catch(() => undefined);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{view ? "Rename view" : "Save view"}</DialogTitle>
        <DialogDescription>
          {view
            ? "The view keeps its filters, sort and columns."
            : "Saves the current search, filters, sort and columns."}
        </DialogDescription>
      </DialogHeader>
      <form.Field
        name="name"
        validators={{
          onDynamic: ({ value }) => {
            const result = viewName(value);

            return result.ok ? undefined : result.message;
          },
        }}
      >
        {(field) => <TextField field={field} label="Name" placeholder="My open deals" />}
      </form.Field>
      {owner ? (
        <form.Field name="shared">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                checked={field.state.value}
                id={sharedId}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
              />
              <FieldLabel htmlFor={sharedId}>Share with the workspace</FieldLabel>
            </Field>
          )}
        </form.Field>
      ) : null}
      <DialogFooter>
        <Button onClick={onDone} type="button" variant="ghost">
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button loading={submitting} type="submit">
              Save
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
