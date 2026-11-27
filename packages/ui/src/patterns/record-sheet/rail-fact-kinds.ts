export type RailFactKind = "code" | "status" | "person" | "property" | "count" | "due" | "date";

const RAIL_FACT_RANK = {
  code: 0,
  status: 1,
  person: 2,
  property: 3,
  count: 4,
  due: 5,
  date: 6,
} as const satisfies Record<RailFactKind, number>;

export function orderFacts<TFact extends { kind: RailFactKind }>(facts: readonly TFact[]): TFact[] {
  return facts.toSorted((left, right) => RAIL_FACT_RANK[left.kind] - RAIL_FACT_RANK[right.kind]);
}
