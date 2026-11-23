// Presentation glossary reviewed against CMS sources on 2026-11-23.
// Internal role codes, categories and workflow states are not Medicare codes.
export const cmsTerminology = [
  ...['cms.term.dme','cms.term.drugsBiologicals','cms.term.medicalSupplies'].map(key=>({key,source:'https://www.cms.gov/manuals/downloads/bp102c09.pdf'})),
  {
    "key": "cms.term.benefitPeriod",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.electionStatement",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.addendum",
    "source": "https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice"
  },
  {
    "key": "cms.term.noe",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/clm104c11.pdf"
  },
  {
    "key": "cms.term.cti",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.recertification",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.f2f",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.poc",
    "source": "https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice"
  },
  {
    "key": "cms.term.idg",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.attending",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.hope",
    "source": "https://www.cms.gov/medicare/quality/hospice/hope"
  },
  {
    "key": "cms.term.adm",
    "source": "https://www.cms.gov/medicare/quality/hospice/hope"
  },
  {
    "key": "cms.term.huv1",
    "source": "https://www.cms.gov/medicare/quality/hospice/hope"
  },
  {
    "key": "cms.term.huv2",
    "source": "https://www.cms.gov/medicare/quality/hospice/hope"
  },
  {
    "key": "cms.term.dc",
    "source": "https://www.cms.gov/medicare/quality/hospice/hope"
  },
  {
    "key": "cms.term.rhc",
    "source": "https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice"
  },
  {
    "key": "cms.term.chc",
    "source": "https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice"
  },
  {
    "key": "cms.term.irc",
    "source": "https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice"
  },
  {
    "key": "cms.term.gip",
    "source": "https://www.cms.gov/medicare/payment/fee-for-service-providers/hospice"
  },
  {
    "key": "cms.term.snf",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.nf",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.mac",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/clm104c11.pdf"
  },
  {
    "key": "cms.term.adr",
    "source": "https://www.cms.gov/data-research/monitoring-programs/medicare-fee-service-compliance-programs/medical-review-education/additional-documentation-request"
  },
  {
    "key": "cms.term.era",
    "source": "https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice"
  },
  {
    "key": "cms.term.spr",
    "source": "https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice"
  },
  {
    "key": "cms.term.eft",
    "source": "https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice"
  },
  {
    "key": "cms.term.carc",
    "source": "https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice"
  },
  {
    "key": "cms.term.rarc",
    "source": "https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice"
  },
  {
    "key": "cms.term.revocation",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.transfer",
    "source": "https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/downloads/bp102c09.pdf"
  },
  {
    "key": "cms.term.liveDischarge",
    "source": "https://www.cms.gov/medicare/quality/hospice/hope"
  }
] as const;
