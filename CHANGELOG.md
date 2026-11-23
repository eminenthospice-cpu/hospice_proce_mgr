# Changelog

## v1.2.0 — 2026-11-23

- Add dedicated DME and Medication order queues using CMS benefit terminology in Korean and English.
- Reuse existing patients, recent suppliers and refill details; automatically record dates, owners and status history. Receipt takes one click; intermediate updates are optional and only exceptions require notes.
- Append 12 fictional DME and 12 fictional medication orders to existing census demo patients without replacing records. Admin and recent MFA are required; duplicate packs are rejected.
- Enforce server-side coordination permissions, patient scope, encrypted storage, CAS/idempotency and audit logging. Receipt does not change clinical evidence or billing gates. No prescribing, order transmission or HospiceMD access/write integration.
- Validate with 43 automated checks, production build, and desktop/mobile UI checks for both languages, append, status changes, exception notes and refill reuse.

## v1.1.1 — 2026-11-23

- Added an administrator-only 38-patient synthetic census demo with recent MFA, duplicate prevention, atomic append, and a dedicated patient-list filter. Existing patients and workflow records are preserved.
- Added Assisted Living Facility and residential-setting categories. Residential settings require place-of-service verification; no billing POS code is inferred.
- Demo identities, dates, facilities, physicians, evidence, and statuses are generated independently of individual EHR records. No EHR write, live synchronization, source patient crosswalk, or patient export endpoint was added.

Validation: 39 automated tests, TypeScript checking, production build, and local browser checks for append behavior, 38-patient filtering, and both languages.

## v1.1.0 — 2026-11-23

- Added Korean and English JSON language packs and a language selector on the sign-in and workspace screens.
- Added explicit `?lang=en` / `?lang=ko` links. The selected language persists on the same browser; only this preference is stored locally.
- Localized navigation, admissions, follow-ups, signature checks, billing gates, remittances, reports, staff permissions, help, accessible labels, date formatting, CSV headings, and API error messages.
- Standardized hospice, certification, election, HOPE, claims, and remittance terminology against CMS sources, with a linked reference in Help and Settings. Internal workflow labels remain identified as internal.
- Preserved stored business keys, role checks, user-entered names and identifiers, MFA, audit records, and encrypted D1 records.
- Allowed fictional `Demo ...` display names alongside `데모...` names, still requiring a `DEMO-` patient number while PHI processing is disabled.

Validation: 36 automated tests, TypeScript checking, production build, isolated browser checks for English/Korean switching, preference restoration, admission saving, staff-role labels, CSV export, and narrow-screen layout. No production patient data is used by preview checks.

The existing BAA deferrals and `PHI_PROCESSING_APPROVED=false` remain in effect. This release does not enable real patient data entry.
