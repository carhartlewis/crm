import { parseAsStringLiteral, useQueryState } from "nuqs";

/** The records that can be created from anywhere in the app (`?create=<kind>`). */
export const CREATE_KINDS = ["company", "workspace"] as const;

export type CreateKind = (typeof CREATE_KINDS)[number];

/**
 * Which create sheet is open. Sheets open from hotkeys anywhere in the app, so their state lives
 * in the URL at the shell level (linkable, back-button safe), not in a page.
 */
export function useCreateSheet() {
  return useQueryState("create", parseAsStringLiteral(CREATE_KINDS));
}
