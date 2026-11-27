import * as React from "react";
import { cn } from "cn";
import { BorderBeam } from "@crm/ui/components/border-beam";

/**
 * Every card carries the border beam. It runs while the card has pointer or keyboard
 * interest, so a page of cards stays calm and costs no paint at rest. Card text is chrome and
 * not selectable; mark CRM values inside a card (names, emails, amounts) `select-text`. Card text
 * stays on one line and truncates as the card narrows, never wrapping to new lines: the title and
 * description slots do it, and custom lines in a card use `truncate` (with `min-w-0` in flex or
 * grid). `className` lays out the card from the call site (it sits on the beam frame); the card
 * fills it.
 */
function Card({
  className,
  size = "default",
  beam = true,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; beam?: boolean }) {
  const [interest, setInterest] = React.useState(false);

  const card = (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground select-none **:data-[slot=input]:select-text **:data-[slot=textarea]:select-text ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        beam ? "h-full" : className,
      )}
      onPointerEnter={(event) => {
        setInterest(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setInterest(false);
        onPointerLeave?.(event);
      }}
      onFocus={(event) => {
        setInterest(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInterest(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );

  if (!beam) return card;

  return (
    <BorderBeam active={interest} className={className}>
      {card}
    </BorderBeam>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "min-w-0 truncate font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("min-w-0 truncate text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
