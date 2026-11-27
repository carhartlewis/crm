import { parseAsString, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";

/** The records that can be created from anywhere in the app (`?create=<kind>`). */
export const CREATE_KINDS = ["company", "contact", "deal", "space"] as const;

export type CreateKind = (typeof CREATE_KINDS)[number];

/**
 * Which create sheet is open. Sheets open from hotkeys anywhere in the app, so their state lives
 * in the URL at the shell level (linkable, back-button safe), not in a page.
 */
export function useCreateSheet() {
  return useQueryState("create", parseAsStringLiteral(CREATE_KINDS));
}

/**
 * The record a new contact or deal starts attached to, such as `company:com_…` from a company's
 * "Add deal", or `contact:ctc_…` from a contact's.
 */
export function useCreateFor() {
  return useQueryState("createFor", parseAsString);
}

/** Opens a create sheet, optionally attached to a record (`company:<id>`, `contact:<id>`). */
export function useOpenCreate() {
  const [, set] = useQueryStates({
    create: parseAsStringLiteral(CREATE_KINDS),
    createFor: parseAsString,
  });

  return (kind: CreateKind, attachTo?: string) =>
    set({ create: kind, createFor: attachTo ?? null });
}

/** Splits a `createFor` value into its kind and id. */
export function parseCreateFor(value: string | null) {
  const [kind, id] = value?.split(":") ?? [];

  return {
    companyId: kind === "company" && id ? id : null,
    contactId: kind === "contact" && id ? id : null,
  };
}
