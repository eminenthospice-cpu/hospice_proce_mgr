# Changelog

## v1.1.0 — 2026-11-23

- Added Korean and English JSON language packs and a language selector on the sign-in and workspace screens.
- Added explicit `?lang=en` / `?lang=ko` links. The selected language persists on the same browser; only this preference is stored locally.
- Localized navigation, admissions, follow-ups, signature checks, billing gates, remittances, reports, staff permissions, help, accessible labels, date formatting, CSV headings, and API error messages.
- Standardized hospice, certification, election, HOPE, claims, and remittance terminology against CMS sources, with a linked reference in Help and Settings. Internal workflow labels remain identified as internal.
- Preserved stored business keys, role checks, user-entered names and identifiers, MFA, audit records, and encrypted D1 records.
- Allowed fictional `Demo ...` display names alongside `데모...` names, still requiring a `DEMO-` patient number while PHI processing is disabled.

Validation: 36 automated tests, TypeScript checking, production build, isolated browser checks for English/Korean switching, preference restoration, admission saving, staff-role labels, CSV export, and narrow-screen layout. No production patient data is used by preview checks.

The existing BAA deferrals and `PHI_PROCESSING_APPROVED=false` remain in effect. This release does not enable real patient data entry.
