# CMS terminology conventions

Reviewed on 2026-11-23. The English names below are drawn from CMS materials. Korean text is an explanatory translation, not an official CMS Korean translation. The app keeps source IDs and stored business keys stable while language packs control the displayed terms.

| Area | Names used in the app | CMS source |
| --- | --- | --- |
| Hospice election and certification | Hospice election statement; Benefit period; Certification of terminal illness; Oral / written certification; Recertification of terminal illness; Face-to-face encounter; Attending physician; Interdisciplinary group | [Medicare Benefit Policy Manual, chapter 9](https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf) |
| Election addendum and levels of care | Hospice election statement addendum; Plan of care; Routine home care; Continuous home care; Inpatient respite care; General inpatient care | [CMS Hospice](https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice), [October 2026 CMS addendum notice](https://www.cms.gov/training-education/medicare-learning-network/newsletter/mln-connects-newsletter-october-1-2026) |
| Claims | Notice of Election (NOE); Medicare Administrative Contractor (MAC); Dates of service | [Medicare Claims Processing Manual, chapter 11](https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/clm104c11.pdf) |
| Quality reporting | Hospice Outcomes and Patient Evaluation (HOPE); HOPE Admission (ADM); HOPE Update Visit 1/2 (HUV1/HUV2); HOPE Discharge (DC) | [CMS HOPE resources, including guidance v1.03](https://www.cms.gov/medicare/quality/hospice/hope) |
| Medical review | Additional Documentation Request (ADR) | [CMS Additional Documentation Request](https://www.cms.gov/data-research/monitoring-programs/medicare-fee-service-compliance-programs/medical-review-education/additional-documentation-request) |
| Payment | Remittance advice; Electronic remittance advice (ERA); Standard paper remittance (SPR); Electronic funds transfer (EFT); Claim Adjustment Reason Code (CARC); Remittance Advice Remark Code (RARC) | [CMS payment and remittance advice](https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice), [Claims Processing Manual, chapter 22](https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/clm104c22.pdf) |

The UI uses the provider-facing ERA / SPR terminology instead of treating EOB as the Medicare provider remittance record. A receipt or payment is not described as claim approval. Oral certification is distinct from written certification; hospice election is distinct from admission.

Administrative owners, Intake/RN-QA staff roles, workstreams, claim preparation batches, review statuses, and the locally calculated live discharge rate are internal workflow concepts. They are not CMS adjudication statuses, official adjustment codes, or an official CMS quality measure. The remittance follow-up reason selector does not record CARC/RARC codes; staff must consult the original remittance advice. The app does not generate an 835, 837I, NOE transaction, or a HOPE submission.

Maintain canonical labels in `locales/en.json` and corresponding Korean explanations in `locales/ko.json`. The linked in-app reference is defined in `lib/cms-terminology.ts`. Do not localize stored enums or change clinical validation rules as part of a terminology edit.
