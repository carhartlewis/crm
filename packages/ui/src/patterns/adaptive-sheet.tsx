import { cn } from "cn";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@crm/ui/components/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@crm/ui/components/sheet";
import {
  type ComponentProps,
  createContext,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

type AdaptiveSheetMode = "sheet" | "drawer";

export type AdaptiveSheetSize = "standard" | "wide";

const DRAWER_HEIGHT_CLASS = "data-[swipe-axis=y]:drawer-content-height";

const SHEET_SIZE_CLASS = cn(
  "data-[size=standard]:data-[side=right]:sm:max-w-2xl",
  "data-[size=wide]:data-[side=right]:w-full data-[size=wide]:data-[side=right]:sm:max-w-none data-[size=wide]:data-[side=right]:lg:w-record-fit",
);

const AdaptiveSheetContext = createContext<{
  mode: AdaptiveSheetMode;
  size: AdaptiveSheetSize;
}>({ mode: "sheet", size: "standard" });

export function useAdaptiveSheetMode() {
  return useContext(AdaptiveSheetContext).mode;
}

const DRAWER_STORES = {
  standard: createDrawerStore("(width < 64rem)"),
  wide: createDrawerStore("(width < 64rem)"),
};

function createDrawerStore(media: string) {
  return {
    subscribe(onChange: () => void) {
      const query = window.matchMedia(media);
      query.addEventListener("change", onChange);

      return () => query.removeEventListener("change", onChange);
    },
    getSnapshot() {
      return window.matchMedia(media).matches;
    },
  };
}

function getServerDrawerMode() {
  return false;
}

export function AdaptiveSheet({
  open,
  onOpenChange,
  children,
  size = "standard",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  size?: AdaptiveSheetSize;
}) {
  const store = DRAWER_STORES[size];

  const drawer = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerDrawerMode);

  const mode: AdaptiveSheetMode = drawer ? "drawer" : "sheet";
  const context = useMemo(() => ({ mode, size }), [mode, size]);

  return (
    <AdaptiveSheetContext value={context}>
      {mode === "drawer" ? (
        <Drawer onOpenChange={(next) => onOpenChange(next)} open={open} showSwipeHandle>
          {children}
        </Drawer>
      ) : (
        <Sheet onOpenChange={(next) => onOpenChange(next)} open={open}>
          {children}
        </Sheet>
      )}
    </AdaptiveSheetContext>
  );
}

export function AdaptiveSheetContent({
  className,
  children,
  initialFocus,
  finalFocus,
  onKeyDown,
  showCloseButton,
}: {
  className?: string;
  children: ReactNode;
  initialFocus?: () => HTMLElement | null;
  finalFocus?: RefObject<HTMLElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  showCloseButton?: boolean;
}) {
  const { mode, size } = useContext(AdaptiveSheetContext);

  if (mode === "drawer") {
    return (
      <DrawerContent
        className={cn("group/adaptive-sheet", DRAWER_HEIGHT_CLASS)}
        data-mode={mode}
        finalFocus={finalFocus}
        initialFocus={initialFocus}
        onKeyDown={onKeyDown}
      >
        {children}
      </DrawerContent>
    );
  }

  return (
    <SheetContent
      className={cn("group/adaptive-sheet outline-none", SHEET_SIZE_CLASS, className)}
      data-mode={mode}
      data-size={size}
      finalFocus={finalFocus}
      initialFocus={initialFocus}
      onKeyDown={onKeyDown}
      showCloseButton={showCloseButton}
    >
      {children}
    </SheetContent>
  );
}

export function AdaptiveSheetHeader({ className, ...props }: ComponentProps<"div">) {
  return useAdaptiveSheetMode() === "drawer" ? (
    <DrawerHeader
      className={cn("group-data-[swipe-axis=y]/drawer-popup:text-left", className)}
      {...props}
    />
  ) : (
    <SheetHeader className={className} {...props} />
  );
}

export function AdaptiveSheetFooter(props: ComponentProps<"div">) {
  return useAdaptiveSheetMode() === "drawer" ? (
    <DrawerFooter {...props} />
  ) : (
    <SheetFooter {...props} />
  );
}

export function AdaptiveSheetTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return useAdaptiveSheetMode() === "drawer" ? (
    <DrawerTitle className={className}>{children}</DrawerTitle>
  ) : (
    <SheetTitle className={className}>{children}</SheetTitle>
  );
}

export function AdaptiveSheetDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return useAdaptiveSheetMode() === "drawer" ? (
    <DrawerDescription className={className}>{children}</DrawerDescription>
  ) : (
    <SheetDescription className={className}>{children}</SheetDescription>
  );
}
