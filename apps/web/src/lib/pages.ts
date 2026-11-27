import building from "@carbon/icons/es/building/16.js";
import currencyDollar from "@carbon/icons/es/currency--dollar/16.js";
import flow from "@carbon/icons/es/flow/16.js";
import userMultiple from "@carbon/icons/es/user--multiple/16.js";
import { carbonIcon } from "@crm/ui/components/icon";

/** The workspace's top-level pages, pinned in the sidebar (the user can reorder them). */
export const pages = [
  {
    id: "companies",
    label: "Companies",
    to: "/companies",
    icon: carbonIcon(building),
    description: "The organisations you work with, and everyone you know there.",
  },
  {
    id: "contacts",
    label: "Contacts",
    to: "/contacts",
    icon: carbonIcon(userMultiple),
    description: "Everyone you know, with their history across email and calls.",
  },
  {
    id: "deals",
    label: "Deals",
    to: "/deals",
    icon: carbonIcon(currencyDollar),
    description: "The pipeline, and everything that has already closed.",
  },
  {
    id: "workflows",
    label: "Workflows",
    to: "/workflows",
    icon: carbonIcon(flow),
    description: "Automations that run when something in your CRM changes.",
  },
] as const;

export type Page = (typeof pages)[number];

export type PageId = Page["id"];

const byId = new Map<string, Page>(pages.map((page) => [page.id, page]));

export function pageById(id: PageId): Page {
  // Every PageId is a key of `byId` by construction.
  return byId.get(id) ?? pages[0];
}

/** The page a pathname belongs to (its own route or anything below it). */
export function pageForPath(pathname: string): Page | undefined {
  return pages.find((page) => pathname === page.to || pathname.startsWith(`${page.to}/`));
}

export function isPageId(value: unknown): value is PageId {
  return byId.has(String(value));
}
