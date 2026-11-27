import calendar16 from "@carbon/icons/es/calendar/16.js";
import {
  formatCalendarDate,
  formatDateTime,
  parseCalendarDate,
  parseDateTime,
  parseTime,
  type TimeOfDay,
} from "@crm/ui/lib/calendar-date";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { carbonIcon } from "./icon";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { SelectField } from "./select-field";

const CalendarIcon = carbonIcon(calendar16);

const DATE_LABEL = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIME_LABEL = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** A new due time starts at 9:00 until someone types another. */
const DEFAULT_TIME: TimeOfDay = { hours: 9, minutes: 0 };

/** Opens on the chosen day, or today, so the arrow keys move through the month at once. */
const focusDay = () =>
  document.querySelector<HTMLElement>(
    "[data-slot=calendar] [data-selected=true] button, [data-slot=calendar] [data-today=true] button",
  ) ?? true;

const atTime = (date: Date, time: TimeOfDay) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hours, time.minutes);

interface PickerTriggerProps {
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** The trigger element, such as an inline value in a record sheet. Defaults to a form field. */
  render?: ReactElement;
  /** What the trigger shows. Defaults to the formatted value, or `placeholder`. */
  children?: ReactNode;
  /** Opens the calendar on mount, for editors that appear on click. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function PickerTrigger({ label, props }: { label: string | null; props: PickerTriggerProps }) {
  const { id, disabled, placeholder = "Pick a date", render, children } = props;

  return (
    <PopoverTrigger
      aria-invalid={props["aria-invalid"]}
      aria-label={props["aria-label"]}
      disabled={disabled}
      id={id}
      render={render ?? <SelectField placeholder={placeholder} />}
    >
      {children ??
        (label ? (
          <>
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate tabular-nums">{label}</span>
          </>
        ) : null)}
    </PopoverTrigger>
  );
}

/**
 * A calendar date ("2026-11-26", or null) picked from the shadcn `Calendar` in a popover. Use it
 * in place of `<input type="date">`, whose picker looks different in every browser.
 */
export function DatePicker({
  value,
  onChange,
  clearable = true,
  ...props
}: PickerTriggerProps & {
  value: string | null;
  onChange: (value: string | null) => void;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const selected = parseCalendarDate(value);

  const choose = (next: string | null) => {
    setOpen(false);
    props.onOpenChange?.(false);

    if (next !== value) onChange(next);
  };

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        props.onOpenChange?.(next);
      }}
      open={open}
    >
      <PickerTrigger label={selected ? DATE_LABEL.format(selected) : null} props={props} />
      <PopoverContent align="start" className="min-w-0" flush initialFocus={focusDay}>
        <Calendar
          defaultMonth={selected}
          mode="single"
          onSelect={(date) => choose(date ? formatCalendarDate(date) : null)}
          selected={selected}
        />
        {clearable && selected ? (
          <div className="flex justify-end border-t border-border p-1.5">
            <Button onClick={() => choose(null)} size="sm" variant="ghost">
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A local date-time ("2026-11-26T09:00", or "" when empty): a calendar plus a typed time, in
 * place of `<input type="datetime-local">`.
 */
export function DateTimePicker({
  value,
  onChange,
  ...props
}: PickerTriggerProps & {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseDateTime(value);
  const [timeError, setTimeError] = useState(false);

  const label = parsed
    ? `${DATE_LABEL.format(parsed.date)}, ${TIME_LABEL.format(atTime(parsed.date, parsed.time))}`
    : null;

  const commitTime = (text: string) => {
    const time = parseTime(text);

    setTimeError(time === null);

    if (time && parsed) onChange(formatDateTime(parsed.date, time));
  };

  return (
    <Popover onOpenChange={props.onOpenChange}>
      <PickerTrigger label={label} props={{ placeholder: "Pick a date and time", ...props }} />
      <PopoverContent align="start" className="min-w-0" flush initialFocus={focusDay}>
        <Calendar
          defaultMonth={parsed?.date}
          mode="single"
          onSelect={(date) =>
            onChange(date ? formatDateTime(date, parsed?.time ?? DEFAULT_TIME) : "")
          }
          selected={parsed?.date}
        />
        <div className="flex items-center gap-2 border-t border-border p-2">
          <span className="text-sm text-muted-foreground select-none">Time</span>
          <Input
            aria-invalid={timeError || undefined}
            aria-label="Time"
            className="h-7 flex-1"
            defaultValue={parsed ? TIME_LABEL.format(atTime(parsed.date, parsed.time)) : ""}
            density="compact"
            disabled={!parsed}
            // A new date or a committed time resets the field to the value's time.
            key={value}
            onBlur={(event) => commitTime(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTime(event.currentTarget.value);
              }
            }}
            placeholder="9:00 AM"
          />
          {parsed ? (
            <Button onClick={() => onChange("")} size="sm" variant="ghost">
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
