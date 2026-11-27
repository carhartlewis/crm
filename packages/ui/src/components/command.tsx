"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@crm/ui/components/dialog";
import { InputGroup, InputGroupAddon } from "@crm/ui/components/input-group";
import checkmark16 from "@carbon/icons/es/checkmark/16.js";
import search16 from "@carbon/icons/es/search/16.js";
import { carbonIcon } from "@crm/ui/components/icon";

const CheckmarkIcon = carbonIcon(checkmark16);
const SearchIcon = carbonIcon(search16);

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "select-none flex size-full flex-col overflow-hidden rounded-xl! bg-popover/80 p-1 backdrop-blur-xl backdrop-saturate-150 text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {/* Opened from the keyboard, so it appears at once: no enter or exit animation. Wide and
          tall enough to show most of its commands without scrolling, within the window. */}
      <DialogContent
        className={cn(
          "top-[18%] translate-y-0 overflow-hidden rounded-xl! bg-transparent p-0 sm:max-w-2xl data-open:animate-none data-closed:animate-none **:data-[slot=command-list]:max-h-[min(32rem,64vh)]",
          className,
        )}
        overlayClassName="bg-black/5 data-open:animate-none data-closed:animate-none"
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "select-text w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <CheckmarkIcon className="ml-auto opacity-0 group-has-data-[slot=command-item-hint]/command-item:ml-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-has-data-[slot=command-item-hint]/command-item:ml-0 group-data-selected/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Muted text at the end of an item, such as the section a search result comes from. */
function CommandItemHint({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-item-hint"
      className={cn("ml-auto shrink-0 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * An item's label with the characters a search matched in bold. `ranges` is a flat list of
 * [start, end) offsets into `text`, in order; without it the text shows as is.
 */
function CommandMatch({
  text,
  ranges,
  className,
}: {
  text: string;
  ranges?: readonly number[] | null;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  let at = 0;

  const marks = ranges ?? [];

  for (let index = 0; index + 1 < marks.length; index += 2) {
    const start = marks[index] ?? 0;
    const end = marks[index + 1] ?? start;

    if (start > at) parts.push(text.slice(at, start));

    parts.push(
      <span key={start} data-slot="command-match" className="font-semibold text-foreground">
        {text.slice(start, end)}
      </span>,
    );
    at = end;
  }

  if (at < text.length) parts.push(text.slice(at));

  return <span className={cn("min-w-0 truncate", className)}>{parts}</span>;
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  CommandItemHint,
  CommandMatch,
};
