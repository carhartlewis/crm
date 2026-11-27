import { useSidebar } from "@crm/ui/components/sidebar";
import { useRouter } from "@tanstack/react-router";
import { useHotkeys } from "react-hotkeys-hook";
import { parsePinKey } from "@crm/core/chat";
import { isPageId, pageById } from "../../lib/pages.ts";
import { usePinnedOrder } from "../../lib/pinned-order.ts";
import { useCreateSheet } from "../../lib/create-sheet.ts";
import { pinnedShortcut, shortcuts, toHotkey } from "../../lib/shortcuts.ts";

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
  // ⌥1–⌥9 follow the sidebar: Pinned's pages, then Pinned chats. Pinned spaces have no hotkeys.
  const pins = usePinnedOrder(userId);

  const order = [
    ...pins.filter((key) => key.startsWith("page:")),
    ...pins.filter((key) => key.startsWith("chat:")),
  ];

  const [, setCreate] = useCreateSheet();

  const pinned = order.flatMap((_, index) => {
    const shortcut = pinnedShortcut(index);

    return shortcut ? [toHotkey(shortcut)] : [];
  });

  useHotkeys(toHotkey(shortcuts.palette), togglePalette, EVERYWHERE, [togglePalette]);
  useHotkeys(toHotkey(shortcuts.sidebar), toggleSidebar, EVERYWHERE, [toggleSidebar]);
  useHotkeys(toHotkey(shortcuts.back), () => router.history.back(), EVERYWHERE, [router]);
  useHotkeys(toHotkey(shortcuts.forward), () => router.history.forward(), EVERYWHERE, [router]);

  // Create sheets open from any page, but not while typing: in a field, ⌥⇧C/P/D still type
  // their characters (Ç, ∏, Î). Held keys repeat, so one press opens one sheet.
  const create = (kind: "company" | "contact" | "deal") => (event: KeyboardEvent) => {
    if (!event.repeat) void setCreate(kind);
  };

  useHotkeys(toHotkey(shortcuts.newCompany), create("company"), OUTSIDE_TEXT, [setCreate]);
  useHotkeys(toHotkey(shortcuts.newContact), create("contact"), OUTSIDE_TEXT, [setCreate]);
  useHotkeys(toHotkey(shortcuts.newDeal), create("deal"), OUTSIDE_TEXT, [setCreate]);
  useHotkeys(toHotkey(shortcuts.newChat), () => void router.navigate({ to: "/" }), OUTSIDE_TEXT, [
    router,
  ]);
  useHotkeys(
    pinned,
    (event) => {
      const pin = parsePinKey(order[Number(event.code.replace("Digit", "")) - 1] ?? "");

      if (pin?.kind === "chat") {
        void router.navigate({ to: "/chats/$chatId", params: { chatId: pin.id } });
      } else if (pin?.kind === "space") {
        void router.navigate({ to: "/spaces/$spaceId", params: { spaceId: pin.id } });
      } else if (pin && isPageId(pin.id)) {
        void router.navigate({ to: pageById(pin.id).to });
      }
    },
    OUTSIDE_TEXT,
    [order, router],
  );

  return null;
}
