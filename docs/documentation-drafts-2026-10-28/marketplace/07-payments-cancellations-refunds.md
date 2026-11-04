# Payments, cancellations and refunds — drafting template

Status: UNPUBLISHED DRAFT. Complete the commercial fields before accepting live charges. Version/effective date: `[FILL]`.

## Identify each transaction separately

| Transaction | Present responsibility | Information to approve |
| --- | --- | --- |
| Goods paid for at handover | Buyer pays merchant directly | Seller identity, full price, returns and refund method |
| Merchant activation/registration | Platform charge only where enabled | Amount, currency, taxes, entitlement and approval dependency |
| Store-fee period | Platform entitlement; current code uses two-month periods | Start/end, price, renewal and lapse behaviour |
| Optional store subscription | Selected plan where offered | Features, period, price, cancellation and any renewal |
| Housing rent/deposit | Separate housing relationship; do not assume PineVela collects it | Collector, tenancy, receipt and refund authority |
| Service booking/deposit | `[DECIDE: currently enabled arrangement]` | Scope, performance, cancellation and permitted payment method |

Never describe all these as one payment flow. Test-mode payment success is not proof that live payments are enabled.

## Draft payment wording

Before you pay, the applicable checkout or seller must show the recipient, amount, currency, taxes and fees, what the charge covers and the relevant cancellation terms. Use only the disclosed payment method. PineVela does not hold a wallet or escrow balance for the current direct-at-handover goods flow.

Platform payments may use Paystack where configured. A browser success screen alone does not grant a paid entitlement: the server verifies the provider transaction and applies the approved entitlement. Reversed or refunded transactions may require entitlement reconciliation. `[FILL: supported live payment methods, merchant of record and support contact.]`

## Draft cancellation wording

You may cancel an eligible active order through the app before completion. Current inventory reservations expire after 24 hours. The cancellation or expiry updates the order and reservation; it does not itself issue a refund for a payment made directly to a seller. Do not mark an order complete or use a handover PIN to settle an unresolved payment dispute.

## Complete the refund schedule

| Scenario | Decision needed | Responsible party / evidence |
| --- | --- | --- |
| Merchant application rejected after a fee | `[DECIDE: whether fee is collected before approval and applicable refund]` | Platform / application and payment reference |
| Duplicate platform charge | `[FILL: investigation and return process]` | Platform/payment provider / references |
| Paid store access not activated | `[FILL: remediation and refund criteria]` | Platform / verified provider transaction |
| Subscription cancellation | `[FILL: effect now/end of period and refund eligibility]` | Platform / plan and period |
| Faulty or misdescribed goods | Preserve applicable statutory remedies | Merchant / order, condition and relevant evidence |
| Non-delivery | `[FILL: cancellation, merchant response and escalation]` | Merchant / order and fulfilment evidence |
| Services started or missed appointment | `[REVIEW: lawful cancellation rules and clear prior agreement]` | Service provider / agreed scope and timing |
| Housing rent or deposit | Separate housing agreement and applicable law | Authorized housing operator / agreement and receipt |

Refund requests: `[FILL: request channel]`; acknowledgement target: `[FILL]`; decision target: `[FILL]`; provider processing estimate: `[FILL]`. Distinguish the decision date from the bank's settlement time. Explain evidence, partial refunds, return costs, payment destination and appeal route. Do not publish unsupported guarantees.

## Rights and transaction disclosures

This policy does not exclude rights that cannot lawfully be excluded. Review Ghana's Electronic Transactions Act, including supplier disclosures and applicable cancellation/refund provisions and exceptions. Display clear supplier identity/contact, total charges, fulfilment information, saveable contract terms and a chance to correct errors before finalization where required. Do not assume a goods rule automatically governs services, housing or every product category.
