# Record fields and facts

Status: open
Type: task
Blocked by: 01
Spec: ../spec.md

Record fields and fact rules.

- Migration: contact `email_status`, `email_verified_at`, `phone_type`; company
  `employee_count`, `founded_year`. Add them to the field lists, normalisers and shapes.
- `RECORD_SOURCES` += `search`.
- `CONTACT_FACT_FIELDS` += email, phone. `factOutcome` scores email by its verdict
  (valid 0.95, catch_all/risky/unknown 0.5, invalid → drop) and phone at 0.55 unless the line
  and person checks pass.
- `record_contact_fact` takes `verdict` and `tregCallId` into evidence.
- Photos: `image_url` facts copy the image into storage at once (LinkedIn URLs expire).
  `PERSON_PHOTO_PATTERN` allows `media.licdn.com` and `img.imagecdn.dev` too.
  Photos are kept at full size (the 30 MB contact photo limit is already in `ImageCache`). When there is no LinkedIn photo, ask
  context.dev for the photo only. Tests use `createMemoryStorage`.
- detail-fields: an email status badge (Verified, Catch-all, Unverified), plus phone type.
