import book from "@carbon/icons/es/book/16.js";
import receipt from "@carbon/icons/es/receipt/16.js";
import building from "@carbon/icons/es/building/16.js";
import list from "@carbon/icons/es/list/16.js";
import plug from "@carbon/icons/es/plug/16.js";
import toolKit from "@carbon/icons/es/tool-kit/16.js";
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
      { to: "/settings/fields", label: "Fields", icon: carbonIcon(list) },
      { to: "/settings/memory", label: "Workspace Memory", icon: carbonIcon(book) },
      { to: "/settings/skills", label: "Workspace Skills", icon: carbonIcon(toolKit) },
      { to: "/settings/usage", label: "Usage", icon: carbonIcon(receipt) },
    ],
  },
  {
    label: "Account",
    pages: [
      { to: "/settings/account", label: "Profile", icon: carbonIcon(user) },
      { to: "/settings/connections", label: "Connections", icon: carbonIcon(plug) },
    ],
  },
] as const;

export type SettingsPath = (typeof settingsGroups)[number]["pages"][number]["to"];

export const isSettingsPath = (pathname: string) =>
  pathname === "/settings" || pathname.startsWith("/settings/");
