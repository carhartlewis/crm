# Usage page and billing export

Status: open
Type: task
Blocked by: 03
Spec: ../spec.md

Per-customer (workspace) usage, so we can bill later.

- `@crm/core/usage`: `formatUsage(micro)` (shows "<$0.01" under 1¢), price from cost and markup,
  and month bucketing. All are pure and tested.
- API: `GET /api/usage?month=` returns totals by day, member, kind (chat, research, sheet) and
  contract. `GET /api/usage/export?month=` returns CSV rows (date, member, chat or record,
  contract, outcome, price; cost too for admins). Both require workspace membership; cost is
  admin-only.
- Workspace settings → Usage (`/settings/usage`, Workspace group): this month's total, a daily
  bar chart, and breakdown tables (DataTable). It has a month picker in the URL (nuqs) and an
  Export CSV button.
- Later, not in this ticket: Stripe metered billing pushes monthly `priceMicro` per workspace
  as meter events.
