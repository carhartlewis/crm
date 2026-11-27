import { customColumnId, type FieldEntity } from "@crm/core/fields";
import type { ColumnKind } from "@crm/ui/patterns/data-table/column-kinds";
import type { DataTableColumn, DataTableFacet } from "@crm/ui/patterns/data-table/data-table";
import {
  createListSearchParams,
  type ListSearchParams,
  type ListTableConfig,
} from "@crm/ui/patterns/data-table/list-search-params";
import { createElement } from "react";
import { TextCell } from "@crm/ui/patterns/data-table/table-cells";
import {
  FILTERABLE_TYPES,
  fieldFacetValue,
  fieldSortValue,
  fieldText,
} from "../../lib/field-format.ts";
import { useEntityFields, useValuesByRecord } from "../fields/use-fields.ts";
import { useMembers } from "./use-crm.ts";

/** A custom field's column and facet id: `cf_<key>`. */
export type CustomId = `cf_${string}`;

/** How a custom field's column sizes and aligns, by its type. */
function columnKind(type: string): ColumnKind {
  switch (type) {
    case "number":
      return "count";
    case "date":
      return "date";
    case "checkbox":
    case "select":
      return "short";
    case "user":
      return "person";
    default:
      return "text";
  }
}

/**
 * A table's search params with its custom facets added. Made once per set of facet ids, so the
 * list keeps one parser set while the fields stay the same.
 */
const paramsCache = new Map<string, ListSearchParams<string, string>>();

function paramsFor<Tab extends string, Facet extends string>(
  config: ListTableConfig<Tab, Facet>,
  custom: readonly CustomId[],
): ListSearchParams<Tab, Facet | CustomId> {
  const facetIds = [...(config.facetIds ?? []), ...custom];

  const cacheKey = `${config.scope ?? ""}:${config.tabId ?? ""}:${config.defaultSort ?? ""}:${facetIds.join(",")}`;
  const cached = paramsCache.get(cacheKey);

  if (cached) {
    // SAFETY: the cache key holds every facet id, so a hit was made with these facets.
    return cached as ListSearchParams<Tab, Facet | CustomId>;
  }

  // SAFETY: a record of the table's own facets is a partial record of them plus custom ones.
  const facetDefaults = config.facetDefaults as Partial<Record<Facet | CustomId, string[]>>;

  const made = createListSearchParams<Tab, Facet | CustomId>({
    ...config,
    facetIds,
    facetDefaults,
  });

  paramsCache.set(cacheKey, made);

  return made;
}

/**
 * The custom fields of a record table: fields offered as columns become columns, and fields
 * offered as filters with a fixed set of values (select, member, checkbox) become facets. The table spreads
 * each part into its own columns, facets, `facetOf` and `sortValues`, and uses `searchParams`.
 */
export function useCustomColumns<
  R extends { readonly id: string },
  Tab extends string,
  Facet extends string,
>(input: {
  readonly entity: FieldEntity;
  readonly userId: string;
  readonly workspaceId: string;
  /** The table's own search params, which the custom facets extend. */
  readonly base: ListSearchParams<Tab, Facet>;
}) {
  const { fields, options } = useEntityFields(input.workspaceId, input.entity);
  const values = useValuesByRecord(input.workspaceId);
  const { members, nameOf } = useMembers(input.userId, input.workspaceId);

  const optionLabels = new Map(
    [...options.values()].flat().map((option) => [option.id, option.label]),
  );

  const optionLabel = (id: string) => optionLabels.get(id) ?? null;
  const memberName = (id: string) => nameOf(id);

  const shown = fields.filter((field) => field.show_on_table);

  const filtered = fields.filter(
    (field) => field.show_on_filter && FILTERABLE_TYPES.has(field.type),
  );

  const valueOf = (row: R, fieldId: string) => values.get(row.id)?.get(fieldId);

  const columns: DataTableColumn<R, CustomId>[] = shown.map((field) => ({
    id: customColumnId(field.key),
    kind: columnKind(field.type),
    header: field.label,
    label: field.label,
    sortable: true,
    cell: (row: R) =>
      createElement(
        TextCell,
        null,
        fieldText(field, valueOf(row, field.id), optionLabel, memberName),
      ),
  }));

  const sortValues: Partial<Record<CustomId, (row: R) => string | number>> = Object.fromEntries(
    shown.map((field) => [
      customColumnId(field.key),
      (row: R) => {
        const value = valueOf(row, field.id);

        return fieldSortValue(field, value, fieldText(field, value, optionLabel, memberName));
      },
    ]),
  );

  const facets: DataTableFacet[] = filtered.map((field) => ({
    id: customColumnId(field.key),
    label: field.label,
    options: [
      { value: "none", label: "None" },
      ...(field.type === "select"
        ? (options.get(field.id) ?? []).map((option) => ({ value: option.id, label: option.label }))
        : field.type === "user"
          ? members.map((member) => ({ value: member.id, label: member.name }))
          : [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]),
    ],
  }));

  const facetOf: Record<CustomId, (row: R) => string> = Object.fromEntries(
    filtered.map((field) => [
      customColumnId(field.key),
      (row: R) => fieldFacetValue(field, valueOf(row, field.id)),
    ]),
  );

  const searchParams = paramsFor(
    input.base.config,
    filtered.map((field) => customColumnId(field.key)),
  );

  /** Custom text the search box also matches. */
  const haystack = (row: R) =>
    shown
      .map((field) => fieldText(field, valueOf(row, field.id), optionLabel, memberName) ?? "")
      .join(" ");

  return { columns, facets, facetOf, sortValues, searchParams, haystack };
}
