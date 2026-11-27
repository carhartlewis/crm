import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { useTheme } from "@crm/ui/components/theme-provider";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useId, useRef } from "react";
import { toast } from "sonner";
import {
  NAME_MAX_LENGTH,
  profileNameError,
  removeAvatarMutation,
  updateNameMutation,
  uploadAvatarMutation,
} from "../../lib/account.ts";
import { initials } from "../../lib/initials.ts";
import { TextField } from "../text-field.tsx";
import { SettingsCard } from "./settings-card.tsx";

interface ProfileUser {
  readonly name: string;
  readonly email: string;
  readonly image?: string | null;
}

/** Your name, picture and theme. */
export function ProfileSettings({ user }: { user: ProfileUser }) {
  return (
    <>
      {/* A saved name comes back in the session; the key starts the form again from it. */}
      <NameCard key={user.name} name={user.name} />
      <AvatarCard user={user} />
      <ThemeCard />
    </>
  );
}

function NameCard({ name }: { name: string }) {
  const formId = useId();

  const update = useMutation({
    ...updateNameMutation,
    onSuccess: () => toast.success("Name saved"),
    onError: (error) => toast.error(error.message),
  });

  const form = useForm({
    defaultValues: { name },
    validationLogic: revalidateLogic({ mode: "blur", modeAfterSubmission: "change" }),
    onSubmit: async ({ value }) => {
      await update.mutateAsync(value.name).catch(() => undefined);
    },
  });

  return (
    <SettingsCard
      title="Name"
      description="The name your workspace sees."
      hint={`Up to ${NAME_MAX_LENGTH} characters.`}
      action={
        <form.Subscribe
          selector={(state) => ({
            submitting: state.isSubmitting,
            changed: state.values.name.trim() !== name.trim(),
          })}
        >
          {({ submitting, changed }) => (
            <Button type="submit" form={formId} size="sm" disabled={!changed} loading={submitting}>
              Save
            </Button>
          )}
        </form.Subscribe>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name" validators={{ onDynamic: ({ value }) => profileNameError(value) }}>
          {(field) => <TextField field={field} label="Name" autoComplete="name" />}
        </form.Field>
      </form>
    </SettingsCard>
  );
}

function AvatarCard({ user }: { user: ProfileUser }) {
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    ...uploadAvatarMutation,
    onSuccess: () => toast.success("Picture saved"),
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    ...removeAvatarMutation,
    onSuccess: () => toast.success("Picture removed"),
    onError: (error) => toast.error(error.message),
  });

  const pending = upload.isPending || remove.isPending;

  return (
    <SettingsCard
      title="Picture"
      description="Shown next to your name across the CRM."
      hint="PNG, JPEG or WebP."
      action={
        <>
          {user.image ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            loading={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {user.image ? "Replace" : "Upload"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];

              // Choosing the same file again still uploads it.
              event.target.value = "";

              if (file) upload.mutate(file);
            }}
          />
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium select-text">{user.name}</span>
          <span className="truncate text-muted-foreground select-text">{user.email}</span>
        </div>
      </div>
    </SettingsCard>
  );
}

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function ThemeCard() {
  const { theme, setTheme } = useTheme();

  return (
    <SettingsCard
      title="Theme"
      description="Light, dark, or match your system."
      hint="Only on this device."
    >
      <Tabs
        value={theme}
        onValueChange={(value) => {
          const chosen = THEMES.find((option) => option.value === value);

          if (chosen) setTheme(chosen.value);
        }}
      >
        <TabsList aria-label="Theme">
          {THEMES.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </SettingsCard>
  );
}
