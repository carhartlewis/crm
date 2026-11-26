// oxlint-disable anti-slop/no-runtime-typeof -- The one guard for ReactNode unions, which have no schema to parse.
export function isString(value: unknown): value is string {
  return typeof value === "string";
}
