# Reconciliation and telemetry

Status: open
Type: task
Blocked by: 03
Spec: ../spec.md

A daily job compares treg `usage/by-tag?key=workspace` against `usage_event.costMicro` sums per
workspace (attributed plus unattributed must equal treg's total) and alerts on drift before invoicing. Add PostHog events (project 544279): usage_recorded (contract, outcome,
cost band; no PII) and enrichment_unavailable (402/429).
