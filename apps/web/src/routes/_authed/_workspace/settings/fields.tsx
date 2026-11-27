import type { FieldEntity } from "@crm/core/fields";
import { createFileRoute } from "@tanstack/react-router";

// Spelled out, not imported: this file loads with the app, and `@crm/core/fields` would pull the
// field and record rules into cold entry. Typed as FieldEntity, so a stale value fails typecheck.
const ENTITIES: readonly FieldEntity[] = ["company", "contact", "deal"];

const isFieldEntity = (value: string): value is FieldEntity =>
  ENTITIES.some((entity) => entity === value);

export interface FieldsSearch {
  readonly entity?: FieldEntity;
}

/**
 * Custom fields of companies, contacts and deals (`?entity=`). The page is in fields.lazy.tsx.
 * The loader waits for the first snapshot of the definitions and options, so the list renders
 * with data; a dynamic import keeps TanStack DB and Electric out of cold entry.
 */
export const Route = createFileRoute("/_authed/_workspace/settings/fields")({
  validateSearch: (search: { entity?: unknown }): FieldsSearch => {
    const entity = String(search.entity ?? "");

    return isFieldEntity(entity) ? { entity } : {};
  },
  loader: async ({ context: { session } }) => {
    const workspaceId = session.session.activeOrganizationId ?? "";
    const fields = await import("../../../../lib/fields.ts");

    await Promise.all([
      fields.fieldDefinitionsCollection(workspaceId).preload(),
      fields.fieldOptionsCollection(workspaceId).preload(),
    ]);
  },
});
