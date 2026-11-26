import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { useIsMobile } from "@crm/ui/hooks/use-mobile";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Separator } from "@crm/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@crm/ui/components/sheet";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@crm/ui/components/tooltip";
import sidePanelOpen16 from "@carbon/icons/es/side-panel--open/16.js";
import { carbonIcon } from "@crm/ui/components/icon";
import {
  nextOpenState,
  parseSidebarWidth,
  resolveSidebarWidth,
  settledWidth,
  SIDEBAR_WIDTH,
  type WidthZone,
} from "@crm/ui/lib/sidebar-width";

const SidePanelOpenIcon = carbonIcon(sidePanelOpen16);

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar_width";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  width: number;
};

/**
 * Whether the sidebar is open lives in a cookie, read through useSyncExternalStore: it survives
 * reloads and restarts, a server could read it for the first paint, and every subscriber sees
 * the same value. `undefined` until the user first toggles (then `defaultOpen` applies).
 */
const sidebarCookieListeners = new Set<() => void>();

function readCookie(name: string) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie)?.[1];
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;

  for (const listener of sidebarCookieListeners) listener();
}

function readSidebarCookie(): boolean | undefined {
  const value = readCookie(SIDEBAR_COOKIE_NAME);

  return value === "true" || value === "false" ? value === "true" : undefined;
}

const writeSidebarCookie = (open: boolean) => writeCookie(SIDEBAR_COOKIE_NAME, String(open));
const readSidebarWidth = () => parseSidebarWidth(readCookie(SIDEBAR_WIDTH_COOKIE_NAME));

const writeSidebarWidth = (width: number) =>
  writeCookie(SIDEBAR_WIDTH_COOKIE_NAME, String(Math.round(width)));

function subscribeSidebarCookie(listener: () => void) {
  sidebarCookieListeners.add(listener);

  return () => {
    sidebarCookieListeners.delete(listener);
  };
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // Controlled through `open`/`onOpenChange`, or else by the cookie.
  const cookieOpen = React.useSyncExternalStore(
    subscribeSidebarCookie,
    readSidebarCookie,
    () => undefined,
  );

  const open = openProp ?? cookieOpen ?? defaultOpen;

  const width =
    React.useSyncExternalStore(subscribeSidebarCookie, readSidebarWidth, () => undefined) ??
    SIDEBAR_WIDTH.default;

  const setOpen = React.useCallback(
    (openState: boolean) => {
      setOpenProp?.(openState);
      writeSidebarCookie(openState);
    },
    [setOpenProp],
  );

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((current) => !current) : setOpen(!open);
  }, [isMobile, open, setOpen, setOpenMobile]);

  // ⌘B / Ctrl+B is bound by the app (react-hotkeys-hook), with its other shortcuts.

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, width],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          // SAFETY: React.CSSProperties does not model CSS custom properties; every key here is a `--*` variable with a string value.
          {
            "--sidebar-width": `${width}px`,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground select-none",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            // SAFETY: React.CSSProperties does not model CSS custom properties; every key here is a `--*` variable with a string value.
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-out in-data-resizing:transition-none",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-out in-data-resizing:transition-[left,right] data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar select-none group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <SidePanelOpenIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

const RESIZE_STEP = 16;
const DRAG_THRESHOLD = 3;

interface ResizeDrag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  readonly openAtStart: boolean;
  raw: number;
  open: boolean;
  zone: WidthZone;
  moved: boolean;
}

/**
 * The sidebar's edge, as in Glass: drag to resize, click to collapse. The width follows the
 * pointer between the limits, sticks at the default, resists past either limit, and the sidebar
 * collapses when dragged past the minimum (and reopens when dragged back). `onHaptic` ticks at
 * each of those moments. Arrow keys resize; Enter collapses; Escape cancels a drag.
 *
 * Dragging writes `--sidebar-width` straight onto the wrapper, so React doesn't render while the
 * pointer moves; it hears about collapse and reopen, and the final width (kept in a cookie).
 */
function SidebarRail({
  className,
  onHaptic,
  ...props
}: React.ComponentProps<"hr"> & { onHaptic?: () => void }) {
  const { setOpen, open, width } = useSidebar();

  const handleRef = React.useCallback(
    (handle: HTMLHRElement | null) => {
      const wrapper = handle?.closest<HTMLElement>('[data-slot="sidebar-wrapper"]');
      const sidebar = handle?.closest<HTMLElement>('[data-slot="sidebar"]');

      if (!handle || !wrapper || !sidebar) return;

      let drag: ResizeDrag | null = null;

      const isOpen = () => sidebar.dataset["state"] === "expanded";

      const currentWidth = () =>
        Number.parseFloat(getComputedStyle(wrapper).getPropertyValue("--sidebar-width")) ||
        SIDEBAR_WIDTH.default;

      const setWidthVar = (value: number) =>
        wrapper.style.setProperty("--sidebar-width", `${value}px`);

      const finish = (commit: boolean) => {
        if (!drag) return;

        const current = drag;

        drag = null;
        delete wrapper.dataset["resizing"];
        delete document.body.dataset["sidebarResizing"];
        delete handle.dataset["limit"];

        if (handle.hasPointerCapture(current.pointerId)) {
          handle.releasePointerCapture(current.pointerId);
        }

        if (!current.moved) return;

        if (!commit && current.open !== current.openAtStart) setOpen(current.openAtStart);

        const kept = commit ? settledWidth(current.raw) : current.startWidth;

        // Transitions are back on, so an overdrag glides to the limit.
        setWidthVar(kept);

        if (commit && current.open) writeSidebarWidth(kept);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;

        event.preventDefault();
        handle.setPointerCapture(event.pointerId);

        const startWidth = currentWidth();

        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth,
          openAtStart: isOpen(),
          raw: startWidth,
          open: isOpen(),
          zone: "free",
          moved: false,
        };
      };

      const onPointerMove = (event: PointerEvent) => {
        if (drag?.pointerId !== event.pointerId) return;

        const dx = event.clientX - drag.startX;

        if (!drag.moved) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return;

          drag.moved = true;
          wrapper.dataset["resizing"] = "";
          document.body.dataset["sidebarResizing"] = "";
        }

        drag.raw = drag.startWidth + dx;

        const nextOpen = nextOpenState(drag.raw, drag.open);

        if (nextOpen !== drag.open) {
          drag.open = nextOpen;
          setOpen(nextOpen);
          onHaptic?.();
        }

        if (!drag.open) return;

        const { width: resolved, zone } = resolveSidebarWidth(drag.raw);

        if (zone !== drag.zone) {
          if (zone !== "free") onHaptic?.();

          drag.zone = zone;

          if (zone === "min" || zone === "max") handle.dataset["limit"] = zone;
          else delete handle.dataset["limit"];
        }

        setWidthVar(resolved);
      };

      const onPointerUp = (event: PointerEvent) => {
        if (drag?.pointerId !== event.pointerId) return;

        // A press that never moved is a click: collapse.
        if (!drag.moved) setOpen(!isOpen());

        finish(true);
      };

      const onPointerCancel = () => finish(false);

      const onWindowKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && drag?.moved) {
          event.preventDefault();
          finish(false);
        }
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();

          const step = event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP;

          writeSidebarWidth(settledWidth(currentWidth() + step));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen(!isOpen());
        }
      };

      handle.addEventListener("pointerdown", onPointerDown);
      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerCancel);
      handle.addEventListener("keydown", onKeyDown);
      window.addEventListener("keydown", onWindowKeyDown);

      return () => {
        finish(false);
        handle.removeEventListener("pointerdown", onPointerDown);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerCancel);
        handle.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keydown", onWindowKeyDown);
      };
    },
    [setOpen, onHaptic],
  );

  return (
    <Tooltip>
      <TooltipTrigger
        delay={600}
        render={
          <hr
            ref={handleRef}
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={SIDEBAR_WIDTH.min}
            aria-valuemax={SIDEBAR_WIDTH.max}
            aria-valuenow={open ? width : 0}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WAI-ARIA window splitter: a focusable separator that arrow keys resize.
            tabIndex={0}
            data-sidebar="rail"
            data-slot="sidebar-rail"
            className={cn(
              "group/rail absolute inset-y-0 right-0 z-20 m-0 hidden h-auto w-2 cursor-col-resize border-0 touch-none outline-none select-none md:block",
              "before:absolute before:inset-y-3 before:left-1/2 before:w-px before:-translate-x-1/2 before:rounded-full before:transition-colors hover:before:bg-foreground/15 focus-visible:before:bg-ring in-data-resizing:before:bg-foreground/25",
              "after:absolute after:inset-y-0 after:-inset-x-1",
              "data-[limit=min]:cursor-e-resize data-[limit=max]:cursor-w-resize",
              className,
            )}
            {...props}
          />
        }
      />
      <TooltipContent side="right">
        <span className="flex flex-col">
          <span>Drag to resize</span>
          <span className="text-background/70">Click to collapse</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full bg-background shadow-none", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  });
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  });
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar();

  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      },
      props,
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  });

  if (!tooltip) {
    return comp;
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the tooltip prop accepts a string shorthand from callers; this is that API boundary.
  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean;
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  });
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  // Random width between 50 to 90%.
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  });

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          // SAFETY: React.CSSProperties does not model CSS custom properties; every key here is a `--*` variable with a string value.
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md";
    isActive?: boolean;
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
