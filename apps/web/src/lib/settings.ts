import book from "@carbon/icons/es/book/16.js";
import building from "@carbon/icons/es/building/16.js";
import user from "@carbon/icons/es/user/16.js";
import { carbonIcon } from "@crm/ui/components/icon";

/**
 * The settings pages, in the groups the sidebar shows while you're in settings (it swaps from
 * the pinned pages to these). Workspace settings are shared by every member; account settings
 * are the signed-in person's own.
 */
export const settingsGroups = [
  {
    label: "Workspace",
    pages: [
      { to: "/settings", label: "General", icon: carbonIcon(building) },
      { to: "/settings/memory", label: "Workspace Memory", icon: carbonIcon(book) },
    ],
  },
  {
    label: "Account",
    pages: [{ to: "/settings/account", label: "Profile", icon: carbonIcon(user) }],
  },
] as const;

export type SettingsPath = (typeof settingsGroups)[number]["pages"][number]["to"];

export const isSettingsPath = (pathname: string) =>
  pathname === "/settings" || pathname.startsWith("/settings/");
