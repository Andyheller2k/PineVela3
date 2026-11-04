# PineVela documentation drafting pack

Status: WORKING DRAFTS — owner completion and Ghana legal review needed before publication.
Prepared: 28 October 2026. These are editable starting points, not a compliance certification.

## How to use the pack

1. Complete [the business decisions](01-business-decisions.md).
2. Edit the public terms, privacy notice and merchant terms first.
3. Keep every `[FILL: ...]`, `[DECIDE: ...]` and `[REVIEW: ...]` item visible until resolved.
4. Review the acceptance requirements. The accompanying app update enforces the current published Platform Terms; this pack's new merchant and other draft agreements are not automatically published or accepted.
5. Review final wording with a Ghana-qualified adviser, approve versions, then use the release checklist. Do not upload this entire folder into the public website.

Confirmed drafting facts: PineVela; operator Oppong Manu Andy; Ghana; support contact andyheller2k@gmail.com; website https://pinevela.app; general minimum age 16. A registered company, full notice address, DPC registration, fees, retention periods and merchant contract-age arrangements have not been confirmed.

## Complete structure

| Document | Purpose | Audience / priority |
| --- | --- | --- |
| [01 Business decisions](01-business-decisions.md) | Fill facts and commercial choices once | Owner / first |
| [02 Platform terms](public/02-platform-terms.md) | Contract for using PineVela | Public / launch |
| [03 Privacy policy](public/03-privacy-policy.md) | Data, purposes, recipients and rights | Public / launch |
| [04 Cookies and analytics](public/04-cookies-and-analytics.md) | Essential storage and optional tracking | Public / before analytics |
| [05 Merchant agreement](marketplace/05-merchant-terms.md) | Seller eligibility, listings, fees and responsibilities | Merchants / before application |
| [06 Buyer rules](marketplace/06-buyer-and-marketplace-rules.md) | Orders, handover, safe buying and messaging | Public / marketplace |
| [07 Payments and refunds](marketplace/07-payments-cancellations-refunds.md) | Separate platform fees from merchant transactions | Public / before charging |
| [08 Manager/property terms](housing/08-manager-and-property-terms.md) | Authority, property information and operations | Housing managers |
| [09 Resident terms](housing/09-resident-housing-use.md) | Room activation and housing-related use | Residents |
| [10 Staff access/conduct](housing/10-staff-access-and-conduct.md) | Invited staff access and confidentiality | Housing staff |
| [11 Acceptable use](community/11-acceptable-use-and-content.md) | Prohibited conduct, content and review integrity | All users |
| [12 Complaints/appeals](community/12-complaints-disputes-appeals.md) | Reporting, decisions and escalation | Public and support |
| [13 Acceptance requirements](internal/13-terms-acceptance-requirements.md) | Checkbox copy, version records and enforcement gaps | Product/development |
| [14 Retention worksheet](internal/14-data-retention-and-deletion.md) | Approved retention and deletion schedule | Privacy/operations |
| [15 Security/provider register](internal/15-security-incidents-and-providers.md) | Access controls, breaches and provider inventory | Restricted internal |
| [16 Publication/versioning](internal/16-publication-and-versioning.md) | Release, links, evidence and policy changes | Owner/development |
| [17 User guides/FAQ](support/17-user-guide-and-faq-structure.md) | Practical help structure | Users/support |
| [18 Onboarding/support copy](support/18-onboarding-and-support-copy.md) | Consistent messages and support templates | Users/support |
| [19 Analytics and DDoS](operations/19-analytics-and-ddos-plan.md) | Current observations and next setup steps | Owner/operations |
| [20 Technical map](operations/20-technical-documentation-map.md) | Existing architecture, deployment and operating docs | Restricted technical |
| [21 Sources/review notes](21-official-sources-and-review-notes.md) | Primary references and legal review questions | Owner/adviser |

## Public versus internal

Publish approved user-facing policies as readable public pages. Keep evidence logs, provider contracts, incident details, internal access procedures, infrastructure configuration and technical runbooks restricted. Never include passwords, service-role keys, private tokens, recovery phrases or approval keys in any published document.

## Product boundaries that every document must preserve

- Buyer–seller messaging is the supported messaging feature.
- Staff are created/invited by an authorized housing manager, not through public recruitment.
- Resident-to-staff reviews require the active authorized housing relationship. Maintenance repair ratings remain a separate workflow.
- Housing access follows authorized assignments. A room key is not proof of property ownership or a substitute for a tenancy agreement.
- Physical-goods orders are paid directly at handover in the documented current workflow; PineVela is not represented as an escrow service.
- Feature eligibility, restrictions and live payment availability must match the deployed app, not a future product roadmap.
