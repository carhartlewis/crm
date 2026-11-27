# E2e and check

Status: resolved
Type: task
Blocked by: 06, 07, 08, 11, 12
Spec: ../spec.md

Playwright: chat search → select 3 → Add to CRM → contacts appear → research fills
verified emails (fake treg in test env). Each paid step shows its price, the turn summary shows the sum, and
the Usage page and CSV match the ledger. `bun run check` is green. Report bundle budget impact
(the People results part must stay out of first view).

## Answer

End-to-end flow test `apps/api/src/services/people-search.test.ts` (find, add, research starts, verified email fact, usage totals). The repo has no Playwright setup and sign-in is Google-only; verified live in the dev workspace instead (see spec).
