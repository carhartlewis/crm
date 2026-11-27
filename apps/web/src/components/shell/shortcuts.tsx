import { useSidebar } from "@crm/ui/components/sidebar";
import { useRouter } from "@tanstack/react-router";
import { useHotkeys } from "react-hotkeys-hook";
import { pageById } from "../../lib/pages.ts";
import { usePinnedOrder } from "../../lib/pinned-order.ts";
import { useCreateSheet } from "../../lib/create-sheet.ts";
import { claimsCopyShortcut, pinnedShortcut, shortcuts, toHotkey } from "../../lib/shortcuts.ts";

// ⌘ shortcuts work everywhere, text fields included. The ⌥ ones (the library's default) stay
// out of text fields, where Option types characters.
const EVERYWHERE = { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true };
const OUTSIDE_TEXT = { preventDefault: true };

/** The shell's global keys. Never animated. */
export function Shortcuts({
  userId,
  togglePalette,
}: {
  userId: string;
  togglePalette: () => void;
}) {
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const order = usePinnedOrder(userId);
  const [, setCreate] = useCreateSheet();

  const pinned = order.flatMap((_, index) => {
    const shortcut = pinnedShortcut(index);

    return shortcut ? [toHotkey(shortcut)] : [];
  });

  useHotkeys(toHotkey(shortcuts.palette), togglePalette, EVERYWHERE, [togglePalette]);
  useHotkeys(toHotkey(shortcuts.sidebar), toggleSidebar, EVERYWHERE, [toggleSidebar]);
  useHotkeys(toHotkey(shortcuts.back), () => router.history.back(), EVERYWHERE, [router]);
  useHotkeys(toHotkey(shortcuts.forward), () => router.history.forward(), EVERYWHERE, [router]);
  // Sheets open from anywhere; ⌘C stays copy while there's a selection or a field has focus.
  useHotkeys(
    toHotkey(shortcuts.create),
    // Held keys repeat; one press opens one sheet, and pressing it again while open does nothing.
    (event) => {
      if (!event.repeat) void setCreate("company");
    },
    {
      enabled: () => claimsCopyShortcut(window.getSelection(), document.activeElement),
      enableOnFormTags: false,
      preventDefault: true,
    },
    [setCreate],
  );
  useHotkeys(toHotkey(shortcuts.home), () => void router.navigate({ to: "/" }), OUTSIDE_TEXT, [
    router,
  ]);
  useHotkeys(
    pinned,
    (event) => {
      const id = order[Number(event.code.replace("Digit", "")) - 1];

      if (id) void router.navigate({ to: pageById(id).to });
    },
    OUTSIDE_TEXT,
    [order, router],
  );

  return null;
}
