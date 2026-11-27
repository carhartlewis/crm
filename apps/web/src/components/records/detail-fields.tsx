import checkmark16 from "@carbon/icons/es/checkmark/16.js";
import { type FieldResult, type FieldSpec, normalizeField } from "@crm/core/records";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@crm/ui/components/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { carbonIcon } from "@crm/ui/components/icon";
import { DatePicker } from "@crm/ui/components/date-picker";
import { Input } from "@crm/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@crm/ui/components/popover";
import { SelectField } from "@crm/ui/components/select-field";
import { Textarea } from "@crm/ui/components/textarea";
import { EmptyCellDash } from "@crm/ui/patterns/empty-cell";
import {
  EntityProperties,
  EntityProperty,
  EntityProseValue,
  EntityText,
  EntityValue,
} from "@crm/ui/patterns/entity-sheet";
import { type ReactNode, useState } from "react";

const CheckIcon = carbonIcon(checkmark16);

/** Focuses a click-to-edit field when it replaces its value button. */
const focusOnMount = (node: HTMLElement | null) => node?.focus();

/**
 * A record's details as label/value rows. `columns={2}` lays two rows side by side (contact and
 * deal overviews); one column fits the company's Details column.
 */
export function DetailList({ children, columns = 1 }: { children: ReactNode; columns?: 1 | 2 }) {
  return <EntityProperties columns={columns}>{children}</EntityProperties>;
}

/** One row: the label, then the value or its editor. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return <EntityProperty label={label}>{children}</EntityProperty>;
}

/**
 * Text you click to edit: Enter or leaving the field saves, Escape cancels. The value is checked
 * with the same rule the API applies (`normalizeField`) before it is sent.
 */
export function TextDetail({
  spec,
  value,
  display,
  normalize,
  onSave,
}: {
  spec: FieldSpec;
  value: string | null;
  /** How the stored value reads when not editing, such as formatted money. */
  display?: ReactNode;
  /** A rule other than the spec's kind, such as a custom number field's. */
  normalize?: (input: string) => FieldResult<string | null>;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (text: string) => {
    const result = normalize ? normalize(text) : normalizeField(spec, text);

    if (!result.ok) {
      setError(result.message);

      return;
    }

    setDraft(null);
    setError(null);

    if (result.value !== value) onSave(result.value);
  };

  if (draft === null) {
    return (
      <EntityValue
        aria-label={`Edit ${spec.label.toLowerCase()}`}
        muted={!value}
        onClick={() => setDraft(value ?? "")}
      >
        <span className="min-w-0 truncate">{value ? (display ?? value) : <EmptyCellDash />}</span>
      </EntityValue>
    );
  }

  const inputType =
    spec.kind === "email"
      ? "email"
      : spec.kind === "url"
        ? "url"
        : spec.kind === "phone"
          ? "tel"
          : "text";

  return (
    <div className="flex w-full flex-col gap-1">
      <Input
        aria-invalid={error ? true : undefined}
        aria-label={spec.label}
        density="compact"
        inputMode={spec.kind === "money" ? "decimal" : undefined}
        onBlur={(event) => commit(event.currentTarget.value)}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
          }

          if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(null);
            setError(null);
          }
        }}
        placeholder={spec.placeholder}
        ref={focusOnMount}
        type={inputType}
        value={draft}
      />
      {error ? <p className="text-caption text-destructive">{error}</p> : null}
    </div>
  );
}

/** Prose you click to edit in a textarea; ⌘Enter or leaving it saves, Escape cancels. */
export function ProseDetail({
  spec,
  value,
  placeholder,
  onSave,
  quiet = false,
}: {
  spec: FieldSpec;
  value: string | null;
  placeholder: string;
  onSave: (value: string | null) => void;
  /** Muted text, as a company's About reads. */
  quiet?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    const result = normalizeField(spec, text);

    setDraft(null);

    if (result.ok && result.value !== value) onSave(result.value);
  };

  if (draft === null) {
    return (
      <EntityProseValue empty={!value} quiet={quiet} onClick={() => setDraft(value ?? "")}>
        {value ?? placeholder}
      </EntityProseValue>
    );
  }

  return (
    <Textarea
      aria-label={spec.label}
      className="min-h-16"
      density="compact"
      onBlur={(event) => commit(event.currentTarget.value)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit(event.currentTarget.value);
        }

        if (event.key === "Escape") {
          event.stopPropagation();
          setDraft(null);
        }
      }}
      placeholder={placeholder}
      ref={focusOnMount}
      value={draft}
    />
  );
}

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly mark?: ReactNode;
}

/** A value picked from a short list (owner, currency). `none` adds a choice that clears it. */
export function ChoiceDetail({
  label,
  value,
  options,
  none,
  onSave,
  field = false,
}: {
  label: string;
  value: string | null;
  options: readonly ChoiceOption[];
  none?: string;
  /** In a form: drawn like an input (`SelectField`), not a quiet property value. */
  field?: boolean;
  onSave: (value: string | null) => void;
}) {
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          field ? (
            <SelectField aria-label={label} placeholder={none ?? `Choose ${label.toLowerCase()}`} />
          ) : (
            <EntityValue aria-label={`Change ${label.toLowerCase()}`} menu muted={!current} />
          )
        }
      >
        {field && !current ? null : (
          <>
            {current?.mark}
            <span className="truncate">{current?.label ?? <EmptyCellDash />}</span>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          onValueChange={(next: string) => {
            const chosen = next === "" ? null : next;

            if (chosen !== value) onSave(chosen);
          }}
          value={value ?? ""}
        >
          {none ? <DropdownMenuRadioItem value="">{none}</DropdownMenuRadioItem> : null}
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.mark}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A value picked from a long, searchable list (a company). */
export function SearchDetail({
  label,
  value,
  options,
  none,
  placeholder,
  onSave,
  field = false,
}: {
  label: string;
  value: string | null;
  options: readonly ChoiceOption[];
  none?: string;
  placeholder: string;
  /** In a form: drawn like an input (`SelectField`), not a quiet property value. */
  field?: boolean;
  onSave: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  const choose = (next: string | null) => {
    setOpen(false);

    if (next !== value) onSave(next);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          field ? (
            <SelectField aria-label={label} placeholder={none ?? `Choose ${label.toLowerCase()}`} />
          ) : (
            <EntityValue aria-label={`Change ${label.toLowerCase()}`} menu muted={!current} />
          )
        }
      >
        {field && !current ? null : (
          <>
            {current?.mark}
            <span className="truncate">{current?.label ?? <EmptyCellDash />}</span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" flush>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup>
              {none ? (
                <CommandItem onSelect={() => choose(null)} value={`__none ${none}`}>
                  <span className="text-muted-foreground">{none}</span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => choose(option.value)}
                  value={`${option.label} ${option.value}`}
                >
                  {option.mark}
                  <span className="truncate">{option.label}</span>
                  {option.value === value ? <CheckIcon className="ml-auto size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A calendar date with the browser's date picker; clearing it saves no date. */
export function DateDetail({
  label,
  value,
  display,
  onSave,
}: {
  label: string;
  value: string | null;
  display: string | null;
  onSave: (value: string | null) => void;
}) {
  return (
    <DatePicker
      aria-label={`Change ${label.toLowerCase()}`}
      onChange={onSave}
      render={<EntityValue muted={!display} />}
      value={value}
    >
      <span className="truncate tabular-nums">{display ?? <EmptyCellDash />}</span>
    </DatePicker>
  );
}

/** A yes-or-no value that saves as soon as it is ticked. */
export function CheckboxDetail({
  label,
  value,
  onSave,
}: {
  label: string;
  value: boolean | null;
  onSave: (value: boolean) => void;
}) {
  return (
    <span className="flex h-7 items-center">
      <Checkbox
        aria-label={label}
        checked={value === true}
        onCheckedChange={(checked: boolean) => onSave(checked)}
      />
    </span>
  );
}

/** A read-only value, or a dash. */
export function StaticDetail({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return <EntityText muted={muted || children === null}>{children ?? "—"}</EntityText>;
}
