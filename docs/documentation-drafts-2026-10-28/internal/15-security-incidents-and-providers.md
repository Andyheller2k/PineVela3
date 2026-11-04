# Security, incidents and provider register

Status: RESTRICTED INTERNAL DRAFT. No credentials belong in this document. Owner/security lead: `[FILL]`.

## Security operating standard

Keep authentication and ownership checks on the server, retain RLS, use least privilege and verify assignment relationships. Browser identity/role/property IDs are selectors, not authority. Use individual authorized staff accounts, promptly revoke departing access and protect backup/recovery material. Review secrets, dependencies, access grants, media ownership and audit coverage at `[FILL: cadence]`.

The app uses HTTP-only account session cookies and scoped server operations. New buyer–seller messages have an encryption workflow, with limitations for legacy messages and deliberately reported evidence. Do not describe all account/support data as end-to-end encrypted or guarantee that every attack is prevented.

## Provider and data-sharing register

| Provider / feature | Data and purpose to verify | Required owner review |
| --- | --- | --- |
| Spaceship hosting | Web/API requests and operational logs | Contract, location, backups, access, DDoS scope |
| Supabase | Auth, PostgreSQL, storage and session/verification records | Region, DPA, retention, access and subprocessors |
| Google sign-in | OpenID/email/profile identity claims | OAuth configuration, consent links, domain and scopes |
| Cloudflare Turnstile | Form security/browser risk checks | Privacy disclosure; not equivalent to site proxy protection |
| Email provider / Resend where configured | Addresses, verification and support mail | Actual provider/SMTP path, retention and delivery access |
| Paystack where enabled | Payment identifiers, amounts, status and appropriate payer details | Live/test mode, merchant contract and refund process |
| Optional Cloudflare Workers AI / Groq | Explicitly approved prompt/context sharing | Selected provider, model, locations, retention and consent |
| OpenAI moderation where enabled | Submitted content required for moderation | Actual enabled categories, retention and review process |
| OpenStreetMap-based map/routing services | Map tiles, search queries, requested routes and network metadata | Actual tile, Nominatim and routing hosts; precise location necessity |
| External Google Maps links | Information supplied when a user opens an external map | Link contents and provider notice |
| Google Analytics 4, new release pending manual installation | Consent-gated general page views/technical attributes | Live verification, lawful basis, settings, opt-out and property retention |

Confirm actual production configuration before naming a provider as active. Environment overrides may change routing/model/email services. Record contract/DPA, countries/transfers, subprocessor list, contact, data minimization, retention, deletion and incident clauses for each enabled provider. Do not claim Ghana-only storage without verified evidence.

## Incident response runbook

1. Receive and timestamp the report; record affected systems and safe evidence. Do not publish exploit details or collect unrelated private data.
2. Assign an incident lead, assess continuing harm and preserve necessary logs with restricted access.
3. Contain proportionately: revoke affected sessions/keys, restrict the compromised operation or restore a known-good build while preserving evidence.
4. Assess whether personal data was lost, altered, disclosed or accessed without authority; identify categories, affected people, providers, likely consequences and mitigations.
5. Have the privacy lead/adviser assess Ghana Act 843 notification obligations and the regulator's current guidance. Do not mechanically copy another jurisdiction's deadline into the policy.
6. Send required regulator/user/provider notices through approved channels with accurate facts and practical protective steps. Record decisions and reasons, including if notification is not required.
7. Restore service, verify security/authorization, document corrective actions and follow up with affected parties as required.

Internal contacts/escalation: `[FILL]`; external legal/privacy adviser: `[FILL]`; incident log location/access: `[FILL]`; recovery targets and tested restoration evidence: `[FILL]`. Do not confuse a backup's existence with a tested restoration.
