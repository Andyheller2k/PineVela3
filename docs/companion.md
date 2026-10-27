# PineVela personal companion

Ask AI is restored as of 2026-10-26 at the owner's request for Spaceship testing.
The primary dashboard mounts its existing companion, with a mobile/tablet tab
beside Home, Purchases, Room and Options and a desktop floating launcher.
Cloudflare Workers AI is the selected testing provider; a complete reply has
been verified locally, while hosting and signed-in chat remain to be verified.
See [Spaceship testing](companion-spaceship-testing-2026-10-26.md).

The retained text-only AI helper has a blurred modal and
four original vector portraits: Nova (female, sci-fi), Mabel (female, vintage),
Axel (male, cool), and Ziggy (male, funny). Their server-defined voices differ;
authorization, app facts and safety rules are shared. This is a private AI
interaction, not a person-to-person or general messaging system.

Preferences persist in Supabase per active primary context: companion, reply
length, optional interests, reminder badge and AI consent. The name comes from
the actual profile; user bubbles use the current profile avatar. AI replies are
off until explicitly enabled. The composer remains editable before consent and
during rate-limit pauses. Its inline disclosure and “Enable AI & send” action
let a user opt in without opening settings; typing and selecting a suggestion
alone never send content to the provider. Settings also explain this data sharing.
Cloudflare requires explicit recipient confirmation even when an older Groq
preference enabled AI. Mobile and tablet navigation places the companion beside
Options, and desktop used a floating launcher. Both opened one shared chat.
The chat panel uses translucent, blurred glass with a yellow border in both
themes. Text and controls retain contrasting surfaces.

The companion is limited to PineVela guidance, friendly casual conversation,
short games, jokes and basic trivia. Recognized coding, essay and media/file
creation requests receive a local, character-specific decline without calling
the provider. The model has the same scope instructions for other requests. The server
also rejects code-formatted output and caps replies at 70/130/200 words for the
three reply styles. It has no browser, code execution, file or media tools.
Local declines still count as chat attempts, while their token reservation is
settled to zero.

`COMPANION_AI_PROVIDER=cloudflare` selects the fixed model
`@cf/openai/gpt-oss-20b`, using server-only `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. The retained Groq configuration uses its own
`GROQ_API_KEY` and fixed `openai/gpt-oss-20b` model. There is no
paid-provider fallback or companion-credit payments. The free allowance reserves
at most 25 attempts per Auth identity and 50 across the app in each five-hour
window, plus token budgets (100,000 per identity / 200,000 global). An attempt provisionally reserves 8,000
tokens; completed work settles actual usage. Unknown/ambiguous failures retain
their reservation. An exact first-call `503 / companion_provider_403` with no
prior provider usage releases the unused token hold once, while retaining the
attempt count. Cleanup matches both the request ID and conversation generation;
an older failed request cannot clear a newer generation's lease. In-memory
limits allow six attempts per identity per minute and
twelve across the app, with a bounded worker queue. Rapid duplicate taps are
blocked before React updates. HTTP rate-limit responses preserve `Retry-After`;
the composer keeps the draft, displays a countdown and pauses sending until it
expires. The provider's retry time is honored without automatic repeated requests.
Windows are selected by the database clock in consecutive five-hour intervals
anchored at 1970-01-01 00:00 UTC. An exhausted app allowance waits only until that
window ends, at most five hours. The retry countdown uses that exact boundary.
Completed replies settle the originally reserved window even across a reset.
The old daily ledger is retained without modification for historical audit;
new reservations use the private, server-only `companion_usage_windows` table.
The provider's independent shared allowance and rate limits can still stop replies
earlier or require a longer provider pause; PineVela cannot shorten those waits.

Provider requests explicitly accept JSON and identify themselves as
`PineVela-Companion/1.0`; they do not impersonate browsers. Cloudflare uses a
bounded HTTPS agent for its fixed hostname and account-specific inference path.
The retained Groq transport uses bounded keep-alive and TTL-limited DNS results
for its fixed hostname, with an OS-resolver fallback and a six-second DNS deadline.
Both verify TLS normally. Alternate resolved IPv4
addresses may be attempted before the request is sent; inference calls are not
automatically retried. Each model call has a 20-second deadline, with a 45-second
reply-work deadline and a 55-second browser request deadline. A slow-reply hint
appears after eight seconds. Cancel reply restores the draft and aborts the
browser request; a disconnected response cancels provider work, and the server
checks cancellation before starting lookups or committing a reply. Failed work
releases its active lease. Safe diagnostics record only failure category and
elapsed time, never message text or upstream error contents. HTTP rejections also
log the HTTP status, a fixed response-format category and allowlisted provider
or edge error codes. Unknown codes, raw bodies and response headers are omitted.

Read-only functions search the real, moderated public catalog, summarize unread
notifications, and read the user's actual manager/resident/seller registrations.
Personal submission-status questions use a fresh session-scoped lookup and a
server-written answer, without a model rewrite. Manager, resident and merchant
results include explicit missing registrations; approval in one never implies
approval in another. A merchant context without a completed application is
reported as incomplete. Older model-written status replies are displayed using
their original verified cards and are excluded from future model history.
Search results are limited to four available listings. No tool accepts an owner
or user ID. Internal links and cards are generated by the server. Notification
titles remain in private UI cards; the model gets counts, not their text. A
summary never marks notifications read. The companion cannot submit forms,
approve applications, buy items, reveal PINs or read encrypted marketplace chats.

Migration `20261018140812_personal_ai_companion.sql` adds three private tables with
RLS, no browser or catalog grants, no public RPC, and no change to existing user
records. The scoped backend may read/change only its own preferences and clear
only its own history; it cannot forge completed replies or access usage counters.
The server revalidates native sessions before tool reads and reply completion.
Migration `20261019123832_companion_five_hour_allowance.sql` adds the fourth,
server-only window ledger with the same RLS and grant restrictions; the original
daily usage ledger is retained. It adds no RPC or user data changes.
An in-flight lease and conversation generation prevent cleared chats from being
recreated by late replies. Responses never include provider reasoning traces.

The most recent 30 turns are retained per account, with a 30-day display window.
Older rows are pruned when that account completes another turn; idle accounts
have no background deletion job. Clear conversation deletes all that account's
turns immediately. Profile name and companion preferences remain until changed.

Checks: `node --import tsx tests/companion.test.ts` and
`node --import tsx scripts/verify-supabase-companion.ts <encrypted-checkpoint-id>`.
`node --import tsx scripts/verify-supabase-companion-allowance.ts <encrypted-checkpoint-id>`
checks five-hour rollover, cross-window settlement, token and request bounds,
concurrent admission, real session ownership, revoked sessions, RLS and restart
persistence on an isolated restore without any provider calls or hosted writes.
The verifier uses real Groq replies, genuine native Auth identities and an
isolated decrypted restore. It changes no hosted records, invents no user token
and exports no private profile/notification data to Groq. It tests database and
unauthenticated HTTP boundaries; authenticated browser coverage is separate.
`node scripts/verify-supabase-companion-browser.cjs` sends real messages using
an approved real browser session. Its existing pre-enabled-session assumption
needs a separate check of Cloudflare's explicit recipient-confirmation flow.
It verifies submission lookup, a coding decline, trivia,
cancellation, automatic timeout recovery, glass surfaces and responsive launcher
placement. It adds three genuine chat turns, does not replace API responses,
and restores the task tab's temporary theme after checking.
The glass panel uses about 38% navy tint in dark mode and 58% white tint in light
mode, with 16px panel blur and a lighter 5px backdrop blur. Text remains opaque;
theme-specific backdrop brightness keeps it readable over dashboard cards.

Client retries retain the original logical request ID and text in account/session-scoped memory. After a disconnected/ambiguous response, retry first checks the saved 30-turn history, then reuses the original ID if needed. A different question cannot overwrite an unresolved send. A valid server `503 / companion_provider_403` response is a confirmed pre-reply rejection: only its matching current-account/session request is released, preserving the draft and error while permitting a different question. Unknown failures, malformed responses, timeouts, cancellation, 409 and 429 remain unresolved. **Check saved replies** recovers a committed answer without another model request. Navigation within the same session retains the unresolved send; sign-out/account changes and confirmed history clearing discard it. A full browser reload does not retain unsent text.

Initial-state reads use a mounted account/session load gate. A newer load,
mutation or unmount aborts and invalidates older reads, including transports
that finish despite cancellation. Failed initial reads stop the opening spinner
and offer Retry. Read lifecycle regressions are covered by
`tests/companionLoad.test.ts`; the private hosting diagnostic's allowlisted
metadata and fixed destinations by `tests/companionHostDiagnostic.test.ts`.
`scripts/verify-supabase-companion-failure-cleanup.ts <encrypted-checkpoint-id>`
checks failed-turn settlement and generation/session isolation on a genuine
isolated restore, without provider calls or hosted writes.
