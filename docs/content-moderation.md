# Automatic content moderation

PineVela checks new marketplace photos, custom store logos/covers, uploaded
profile pictures, listing text and store-profile text before publication. The
server uses OpenAI `omni-moderation-latest`; the key is server-only
`OPENAI_API_KEY`. New checks fail closed when credentials, provider responses,
network access or storage are unavailable. The current profile/listing remains
saved while a replacement fails. Preset avatars and standard store branding
remain available without sending those selections to an external service.

## Publication boundary

The server authenticates and authorizes the real account before classifying.
Image checks use decoded, normalized PNG pixels, with no identity, email,
Storage credentials, public image URL or browser-supplied verdict. The provider
origin/model are server-selected. Calls have a 15-second deadline, bounded
response size, bounded concurrency and per-account admission. External calls
run outside database transactions and locks.

Decisions bind the account context, purpose, exact SHA-256 digest and policy
`pinevela-nsfw-v1`. Approved identical submissions reuse their actual decision.
Final writes revalidate the native session and exact content. PostgreSQL guards
media reservation/readiness, profile attachment, store text and final listing
publication, including price-option labels. Public catalog projections and
authenticated Storage/media RLS also filter unapproved content. A browser cannot
forge an approval, attach another identity's image, or reuse a text approval
after changing the text. Approval does not replace normal ownership, payment,
subscription, housing, administrator-key or account-policy checks.

## Review and recovery

The provider's sexual-content flag blocks publication. Sexual-content scores
of at least 0.2 select additional human review, even when the provider has not
flagged the input. Clear adult-marketplace terms are also held for review.
Scores are model signals, not calibrated probabilities; thresholds need
reassessment when the model/policy changes. Both held and blocked content stay
unpublished until the existing policy or an exact administrator decision allows
them. No classifier result automatically bans an account.

Flagged submissions create a linked Help case and safety report. The requester
can follow the case; customer service can respond using existing email and
in-app notification delivery. The safety-report workspace contains a paginated
automatic-check queue. Quarantined images load only after an invited active
operator selects **Review flagged photo**. Image reads recheck membership after
Storage I/O and use private/no-store delivery. Quarantine has no ordinary media
row, public URL or browser Storage grant.

Administrators use their existing private approval key to approve an exact
false-positive submission or keep it blocked, with a recorded reason. The user
then retries the same submission through normal authorization and publication.
Content approval does not publish an item, change a profile, delete data or
alter an account automatically. Customer service recommends account sanctions
through the existing safety-report workflow; the administrator quorum/founder
process remains mandatory.

`private.content_safety_checks` and `private.content_safety_decisions` have RLS,
no browser/catalog grants, no scoped-backend write grants, immutable history
and retained foreign keys. Evidence includes model, provider request reference,
policy, digest, review state and ownership. Flagged text and image evidence are
operator-only in API projections. The existing signed-in requester can view
their own support case. Cleanup/wipe workflows must preserve or explicitly
review these retained dependencies. Database backups and private Storage backup
remain separate; quarantine uses the existing UUID-owned Storage path format.

## Scope limits

Buyer–seller chats remain end-to-end encrypted and are not submitted to this
API. Private housing/inspection/maintenance photographs and identity documents
are outside this classifier. This implementation does not classify video/audio
or establish the legality of goods.

OpenAI does not provide a CSAM detector through this API and prohibits sending
known/suspected CSAM to it. Strong child-sexual-abuse text/filename concerns are
held locally without a provider call and cannot be approved through the general
content-decision endpoint. This text guard is not an image-based child-safety
system; dedicated child-safety handling remains a separate requirement.

## Deployment and verification

Migration `20261017231850_automatic_content_moderation.sql` installs the private
decision tables, immutable guards, publication checks and restrictive read
policies. It has passed a transactional dry run and commit on the owned local
native test database. After explicit authorization, all eight existing private
photos passed genuine OpenAI checks. The configured hosted project now has all
74 reviewed migrations and the approved receipts. Existing photo ownership,
digests and saved content remain unchanged.

`scripts/backfill-supabase-content-safety.ts capture <absolute-private-file>`
performs that operator audit only after authorization. Private checkpoints retain
completed results across retrieval timeouts; unchanged completed photos are not
resent on resume. `apply` rejects incomplete scans and imports genuine
approved receipts only after rechecking current ownership and exact digests;
there is no assumed-safe legacy exemption. Flagged existing content stops this
operator cutover path for a separate review. Evidence stays under
`.security/nsfw-moderation/` and is never served by the frontend.

The isolated native run passed 56 real-provider/Auth/HTTP/RLS checks. Only public
PineVela brand pixels and text in owned test accounts were sent to OpenAI. No
existing hosted private image was exported during that isolated run. Checks cover approved uploads,
unchanged-avatar reuse, cross-account denial, provider failure, retained current
content, real flagged text, private review, administrator keys, exact approved
resubmission, changed-text denial, direct SQL bypasses and operator suspension.

Run `node --import tsx scripts/verify-supabase-content-safety.ts <private-local-metadata.json>`
with the owned native stack. The test deliberately opts into the authorized
moderation key; hosted database, payment and email configuration stay outside
the child process. The matching preview/browser scripts test the actual UI.
The completed browser run passed 14 checks for customer service and administrator
review at desktop and mobile sizes, including private photo loading and approval
dialog cancellation. The native read-only schema audit passed 130 checks covering
migration digests, RLS, role grants and private functions. A further light/dark
browser recheck was interrupted and is not counted as completed verification.

After activation, `scripts/verify-supabase-content-safety-installation.ts` passed
104 read-only database/API assertions, including every migration digest, private
evidence grants/RLS, direct browser-role denial, unbound backend denial, all eight
existing photo approvals, altered-digest denial, guest/CSRF protection and private
file denial. Supabase's remote security advisor reported no issues. No customer
account, listing, photo or support case was created or removed during activation.

Two subsequently supplied test images produced genuine OpenAI responses using
the application's upload decoder and decision policy. The gun photograph had
no category flags and was approved. The second photograph had no category flags
and a sexual-content score of approximately 0.0964, below the 0.2 review
threshold, so it was also approved. These results do not establish that an
NSFW photograph is successfully blocked. The current sexual-content policy does
not enforce a separate weapons-sale prohibition or a general revealing-clothing
ban.

The test used a working curl IPv4 transport to the exact OpenAI endpoint after
the execution environment's native Node requests timed out. Both profile and
marketplace decoding produced identical pixels for each supplied image. This
was a classifier/policy test, with no live account upload, publication, support
case or database write. Private request references, digests and results are
retained in `.security/nsfw-moderation/submitted-images-verified-results.json`.

Provider details: [OpenAI moderation](https://developers.openai.com/api/docs/guides/moderation)
and [model limits](https://developers.openai.com/api/docs/models/omni-moderation-latest).
