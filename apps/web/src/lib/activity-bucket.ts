/**
 * The Activity filter on companies and contacts: how recently something was logged on a record.
 * The day ranges nest, so a record touched three days ago is in Last 7, 30 and 90 days.
 */
export const ACTIVITY_BUCKETS = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "older", label: "Older", days: null },
  { value: "never", label: "Never", days: null },
] as const;

const DAY = 86_400_000;

/**
 * The Activity filter values a record matches, given its `last_activity_at` and the local day
 * (`YYYY-MM-DD`, from `localDay`): ages count from the end of today.
 */
export function activityBuckets(lastActivityAt: string | null, today: string): string[] {
  if (!lastActivityAt) return ["never"];

  const at = new Date(lastActivityAt).getTime();

  if (Number.isNaN(at)) return ["never"];

  const age = new Date(`${today}T23:59:59.999`).getTime() - at;
  const recent = ACTIVITY_BUCKETS.filter(({ days }) => days !== null && age <= days * DAY);

  return recent.length > 0 ? recent.map((bucket) => bucket.value) : ["older"];
}

/** The facet the record tables show. */
export const ACTIVITY_FACET = {
  id: "activity",
  label: "Activity",
  options: ACTIVITY_BUCKETS.map(({ value, label }) => ({ value, label })),
};
