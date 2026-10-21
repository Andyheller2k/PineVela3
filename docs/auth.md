# PineVela Authentication and Authorization

## Runtime checkpoint — 16 October 2026

Supabase PostgreSQL/Storage and Supabase Auth are the sole runtime persistence and
identity services. Default `dev`, `build` and `start` use `supabase-server.ts`.
Forty legacy JSON/custom-session modules are removed. The owner classified all
legacy records as development data; 29 data/upload files and the old build were
privately archived with verified hashes. No legacy records were imported. The
hosted checkpoint retained exactly seven Auth subjects, six profiles and ten
contexts, with unchanged UUID-set fingerprints.

See [isolated workflow acceptance](migrations/isolated-workflow-acceptance.md) for
the actual HTTP/browser coverage and remaining acceptance scope. Automated checks
do not establish a physical property visit or every nested form/provider journey.
Dated migration/checkpoint descriptions below are historical evidence, not an
instruction to restore retired runtime paths.

## Local Google manager enrollment — migration 69, 14 October 2026

The local Supabase preview can enroll a separate real Google identity for a manager
without a work mailbox, an email code or a newly chosen password. This is the user's
temporary development policy while domain/Resend setup is deferred. The server-only
`PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT=true` flag requires a direct loopback request,
non-production mode and no public origin. Production and ordinary email enrollment
retain their organization-email rules. Supabase email confirmation is not disabled.

The signed-in primary owner reserves the enrollment. A separate popup uses real
Supabase Google OAuth with server-held PKCE, a one-time state, an HttpOnly flow cookie
and a private enrollment nonce. The callback verifies the exact email, native Google
identity and live session, then rechecks the original primary session and ownership.
It cannot adopt an existing PineVela profile or turn an administrator into a manager.
Temporary Google proof tokens stay server-side and their session is locally signed out;
primary authentication cookies and portal selection are preserved.

Migration 69 defers all application profile/role creation for a reserved Google manager
until this owned callback supplies its private nonce to the existing private initializer.
Raw OAuth signup alone grants no app portal. The verified manager remains pending;
property inspection and administrator approval still gate operational login. The UI can
verify the identity before collecting property details and reloads saved enrollment state
following an uncertain reply. Popup messages are hints, never verification authority.

On 15 October the user completed genuine separate Google signup and submitted a manager
application. Saved verification, primary ownership and reload/resume passed 23 browser
checks; 50 checks against an unchanged encrypted checkpoint confirmed Google identities,
callback audit, ownership, lifecycle notification routing and pending-role isolation.
At that signup checkpoint the application was `inspection_pending` and the manager
remained pending. On the owner's later explicit authorization, the real officer
submitted a clearly marked development-only report with physical findings unconfirmed
and a reinspection recommendation. A genuine administrator then approved it with an
explicit development-only explanation; the saved manager became active and the user
completed genuine Google manager sign-in. That development property was later
removed through the owner-approved native cleanup while retaining the real manager
account. These development checks do not establish a physical site visit. See the [current continuation](../SUPABASE_CONTINUATION.md).
Email delivery and the final student/work/email-signup domain and single-use token rules
are deferred to launch-auth setup after development persistence cutover, before release.
See [implementation and evidence](migrations/google-manager-development-enrollment.md).

Primary-dashboard and manager-registration data reads now have a 30-second deadline,
visible retry states and captured-account/unmount guards. Primary profile loading no
longer waits for catalog/orders; dashboard refreshes cannot overlap. Manager registration,
enrollment, server-selected sign-in policy and cooldown now load through one authenticated
`GET /api/users/manager-onboarding` read. Its owned snapshot also seeds the verification
form, avoiding two duplicate child reads. The endpoint rejects identity selectors and
stale account/profile headers, and uses `authorizedRead` to recheck the live actor,
account policies and maintenance in the same transaction. It runs after CSRF protection
and before the redundant global maintenance read; it does not bypass maintenance.
Pure enrollment reads share the owner profile lock; mutations retain their update lock.
Failed checks keep registration closed. The Supabase manager-registration route also waits for a restored
verified sign-in before mounting its form and account reads; guest denial resolves to
the login page. Legacy routing is unchanged. These are page-data reads; shared session-restoration/refresh
coordination is unchanged. Database connection acquisition fails with a sanitized,
retryable 503 before work executes; no authentication or mutation is replayed.
Administrator-message and account-access notice reads also share one pending refresh
per mounted account, stop in hidden tabs and cancel on hide/account change/unmount.
Notification and dashboard periodic refreshes resume when visible; settings and
maintenance-notice queries honor cancellation and the 30-second deadline. These UI
refresh controls do not replace server-side access checks or change acknowledgement.

On 15 October, the actual signed-in manager verification form and one-retry recovery
passed 14 browser assertions twice, including real selector/stale-account denials. Normal
snapshots took 16.5–20 seconds (11.1–13.1 seconds before browser send, 5.4–6.7 seconds
waiting for headers); retries took 6.8–7.9 seconds. An earlier cold attempt still timed out. These checks
establish the complete form and recovery, not resolution of all cold-browser latency or
successful Google-manager signup/property submission. Native manager/residence acceptance
passed 155 checks, including maintenance denial, with zero security-advisor findings.

## Native account lifecycle and historical migration checkpoints

Academic-year room reset uses the authenticated assigned manager’s current operation
key or an administrator’s own approval-key grant. Body ownership selectors and stale
captured account contexts are rejected. The server derives residence scope, exact room
allocation/key state and affected primary recipients; an exact preview and typed consent
are required. Reset revokes resident app bindings while preserving Auth/native sessions,
shared seller credentials/PINs and history. Old resident bindings and keys cannot reopen
housing. Residents use verified re-enrollment plus a new room key before logging in again.
Native checks pass; genuine operational manager browser reset remains acceptance work.

The retained manager re-enrollment workflow accepts only the original primary owner
and original verified work identity. Confirmation uses a real existing email
password or an explicitly requested work-email OTP/unopened sign-in link. OTP requests
set `create_user:false`; the recipient comes from the owned enrollment. Temporary
provider proof sessions are never returned or bound to the primary portal and are
locally signed out after confirmation. Identity selectors, stale contexts, recovery
links and unrelated subjects are rejected. Google-only work identities can use email
confirmation without changing their Google password.

Migration 56 keeps the Auth UUID, manager context and enrollment, increments a private
registration generation, invalidates the previous operation key and manager app
bindings, and leaves the manager pending. Existing restrictions and closure reviews
must permit re-enrollment; a fresh property inspection and approval are required.
Previous cases remain history and cannot dispatch or approve the new generation.
Native proof/session checks are verified; genuine email delivery/password/browser
acceptance remains pending. No live manager has been re-enrolled by verification.


Active unassigned manager portals now use the same native own-key request boundary
and five-member account review as other account actions. Five distinct current own
approval-key votes, including the founder, permit a separate final founder
confirmation. Migration 55 rechecks the exact request and unassigned dependencies
before closing only the manager context and revoking its app bindings. Native Auth
subjects/sessions, sibling portals and history are retained. Changed assignments,
manager-key versions or registration restrictions invalidate collected consent.
Pending/rejected registrations never gain an active manager login from this flow.
An active unassigned manager can issue or petition/reset its operation key through
the existing authenticated key endpoints. Primary callers cannot close that portal.

The default `supabase-server.ts` backend implements Supabase password/Google login,
confirmed signup, HttpOnly access/refresh cookies, session refresh/revocation and
subject-bound account selection. The former JSON credential/session backend is removed. Resident,
manager and seller accounts retain verified student/work identities linked to the
primary owner through authorized enrollment. Resident and seller may share the same
student identity with one Supabase password and distinct portal access PINs; managers
use their separate verified manager identity (normally work email; the local Google
development exception is described above). Native enrollment, room claim and
authenticated portal journeys have the coverage recorded in the isolated acceptance report.
Primary-user sign-in must never select a child's account without that account's own
verified Auth session. The provider/session sections below describe the active native
boundary. Dated checkpoint results remain historical evidence.

Initial browser restoration now shares one cookie-backed check across StrictMode
subscribers. Temporary network, rate-limit and server failures receive at most
three automatic attempts; exhausted checks or a check taking over 45 seconds show
a retry screen on protected routes and private invitations while retaining the
requested route. Public landing browsing remains available. A pending check is reused on
retry rather than aborted, so its refreshed HttpOnly cookies can still arrive.
Only a server-validated identity grants access; a genuine 401/403 still ends
restoration as signed out. Login/logout and explicit account replacement invalidate
older restoration results, and login/logout wait for the pending check to drain.
Transport expiry/access notices from an earlier client session generation are
ignored. This does not change native session verification, key requirements or RLS.

Logout shows immediate pending feedback and coalesces duplicate clicks. Success
is shown only after deleting the exact provider-verified session's native app
binding. The local-scope provider cleanup then runs with its existing bounded
deadline, outside the response path. A still-valid JWT cannot regain app or direct
Data API access without that binding. Provider verification or database failure
does not report success; cookies remain available for retry. Other browser/device
sessions are retained. Private query caches are cleared on logout, without
triggering another round of dashboard reads.

Session discovery reads the live binding and account policy in one atomic SQL
statement. Protected operations still recheck both inside their transaction.
Ordered admission locks are sent with BEGIN; claims, maintenance checks and the
server-selected RLS role use ordered statements in one round trip. No identity,
policy or authorization result is cached across requests.
Actual administrator and isolated guest browser checks passed with delayed outgoing
requests and native connection failures; no API responses or identities were mocked.

The native appearance API derives preference ownership from the verified
native session's active portal and uses the scoped backend role under RLS. The
browser sends its captured `X-PineVela-Profile-Context` only as a consistency check;
a mismatch returns 409 and never selects an account. Delayed writes whose native
portal binding has changed are rejected inside the transaction. Shared Auth
identities keep separate portal themes. Public mode remains a device preference;
account caches support offline changes, and confirmed saves persist in PostgreSQL.

Resident/seller portal PIN changes use `GET /api/auth/portal-security` and
`POST /api/auth/portal-pin` from the currently authenticated portal. The server
derives the target from its native session; selectors and stale captured context
headers are rejected. The current PIN is required. Five wrong guesses commit a
15-minute lockout. The existing private PIN trigger increments the version, denying
older bindings for that portal while preserving the shared Auth identity/password
and companion portal. A still-valid companion session can use the new PIN in the
existing authorized context switch; an invalidated binding cannot revive itself
through refresh. Credential hashes stay server-only under existing private-table
RLS/grants. Audits and notices to the portal and its saved primary owner are atomic.

In the native backend, the old parent-managed
`POST /api/users/reset-registered-account-password` returns 410 to an authenticated
primary account. The primary UI instead directs the person to sign in through the
verified resident identity. Resident Settings and seller Store Profile offer own
PIN rotation. Account closure uses the native reviewed lifecycle; legacy credential
handlers are removed. See the individual lifecycle documents for available actions.

The manager's active `POST /api/auth/change-password` caller now has a replacement:
only a verified manager session with its existing manager-key grant may invoke it.
No email/ownership selectors are accepted. The captured context header only detects
stale requests. The server derives the Auth mailbox, verifies the current password
through a genuine temporary Supabase password sign-in, verifies that provider subject
against the original actor, then calls authenticated `PUT /auth/v1/user`. This proof
does not depend on the project's optional current-password enforcement setting.
Google-only identities receive instructions to use email recovery; Google credentials
are never changed. Password strength, secure reauthentication and MFA restrictions
remain enforced by the provider. The temporary session is never bound to a portal or
returned to the client, and its local provider logout is attempted in `finally`.

`Forgot Password?` on the native login and the manager's recovery button open
an email-proof form. `POST /api/auth/recover` requests delivery with the provider's
non-enumerating successful response; `POST /api/auth/recover/complete` accepts only
email, recovery code/link and new password. An unopened configured-project recovery
link is parsed without being followed; signup/invitation/foreign/ambiguous links are
rejected. Supabase verifies recovery proof, and its verified mailbox and native
session must match an already-enrolled identity. Recovery never creates a profile,
selects a portal, grants roles, or substitutes for a portal PIN. The isolated acceptance
report records actual local captured-mail recovery and password replacement; production
mail delivery and unlisted provider journeys require their own acceptance.

After a provider-confirmed change, one native transaction deletes all application
bindings for that Auth identity and records a secret-free audit and notices to its
own eligible portals, including the seller inbox. Separate primary/work/student
identities, ownership, room allocations, policies, keys and PINs are preserved.
Native Auth session revocation is performed by Supabase's password update; no Auth
passwords or sessions are written through SQL. Browser cookies are not replaced by
recovery or cleared by a delayed password-change response; the manager UI guards
against completing an old account's request after switching accounts. An expired
recovery proof produces 400 rather than an application-session 401. Provider or
commit timeouts can have taken effect: mutations are never replayed, and the UI
instructs the user to sign in with the new password or request fresh recovery proof.
All three POST endpoints share the authentication attempt budget and CSRF boundary.

Boundary verification passed 57 isolated-native checks using genuine archived
subjects/sessions, 12 actual guest/cross-site HTTP checks, 10 genuine administrator
browser checks and 27 guest responsive/theme dialog checks. These do not verify a
successful provider password change or email delivery; no provider replies were
mocked and no live credentials were changed. No migration was needed for this round.
See [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
and the provider's [password lifecycle](https://github.com/supabase/auth/blob/master/internal/models/user.go).

The native `/api/student/my-profile` and `/api/student/my-rooms` reads allow
only a verified primary or resident portal. Resident access derives from that
portal's active allocation. Primary status access requires the allocation, child
context and child profile to agree on the saved primary owner. It exposes room
status separately from the signed-in identity's canonical profile and never
inherits a child's photograph or credentials. Client account selectors are
rejected; the optional captured context header is only a stale-request check.
This status projection does not widen direct allocation RLS or authorize a
primary account to perform resident maintenance operations.

Retained Google identities created before the schema must explicitly choose Google
Sign Up in the native app to initialize their ordinary primary profile.
The server verifies the PKCE session with Supabase `/user`, then rechecks the exact
saved verified Google identity and live native session within the transaction.
Initialization is serialized per Auth subject and leaves an existing profile intact.
No legacy credentials, photographs, linked records or secondary roles are imported;
no administrator membership is granted. Normal login never initializes a missing
profile. Pending sub-account invitations still require their authorized enrollment
token. The selected founder is provisioned separately by the private operator script
after their own genuine signup. For loopback acceptance on the native server,
allow `http://127.0.0.1:3001/api/auth/google/callback**` in Supabase redirect URLs.
Google login with a retained identity that has no new-app profile now redirects
with `google_error=missing`, instructing the person to use Google Sign Up with the
same account. Private invitation continuation is preserved. An existing inactive
profile keeps its access denial and cannot be reinitialized through this message.

Migration 39 binds bans and restrictions to saved account contexts and ownership,
never mailbox equality. A primary policy follows its linked portals and managers'
staff; administrator portals stay protected by their separate governance protocol.
Resident/seller sharing one verified student identity keep independent own policies.
Server binding, refresh use, context switching, API transactions and native RLS deny
active bans and sessions created before a saved ban/restoration epoch. An expired or
restored ban requires a genuinely new Supabase sign-in; refresh cannot revive the old
session. Auth users and shared native session rows are preserved. Sign-in projection
and `/api/auth/account-access` expose only the current portal's access status; affected
primary owners also receive actual policy notices. Real provider/browser sign-in after
policy application remains an acceptance gate.

Field officers sign in through the main `/login` page. All four officer workspace
URLs require an officer role; an administrator session cannot enter that workspace.
The former officer-only sign-in form and its general-login fallback are removed.
Officer logout revokes the session and returns to `/login`. Existing compatibility
login APIs still authenticate actual officer records and reject admin credentials.

Officer onboarding now requires a private invitation authorized by an active
administrator’s own approval key. The separate official verified identity accepts
from its primary account; existing administrator/other portal identities cannot be
converted. Acceptance retains the primary context and requires a genuinely fresh
officer sign-in. Native context locks serialize binding with keyed suspension or
restoration. A consumed invitation reports status and cannot restore access. See
[officer invitations](migrations/officer-invitations-and-room-delivery.md).

In the native backend, an active administrator enrolls a separate settings key
within five minutes of an actual Google or verified-email sign-in. A refresh token does
not create a fresh enrollment window, and no local password is required for Google-only
accounts. The key is displayed once and its salted, context-bound hash stays private.
Public signup never grants administrator membership. Approval keys use the same real
fresh-sign-in requirement, with their own salted hash, version and persisted lockout.
Recovery requires two other active administrators with enrolled approval keys; the
proposer counts once and the target cannot vote. A successful recovery clears only the
selected key and invalidates the target's older administrator app sessions, including
browser RLS access. Refresh cannot restore access: the target needs a new provider Auth
session and fresh enrollment. Auth accounts are preserved. Real fresh enrollment and
post-recovery provider sign-in remain acceptance gates.

Founder-keyed suspension and restoration also advance a server-controlled membership
session epoch. SQL and every administrator binding check enforce both the membership
epoch and the key-recovery epoch against the actual Auth session creation time.
Restoration cannot revive an old session through refresh or the account switcher.
The primary identity and keys are preserved; the primary inbox receives the person's
own suspension/restoration notices. Actual restored provider sign-in remains a gate.

Permanent administrator removal closes only that portal and marks its membership removed.
Every server binding, context switch and direct RLS check denies its existing sessions.
The shared Auth identity and primary portal remain intact; administrator keys are deleted.
Four other eligible approval keys, private appeal review and explicit founder confirmation
are required. Public signup and primary login cannot restore a removed administrator.

Private administrator invitations now require the recipient's actual verified primary
session, matching mailbox, one-time token and the saved Auth UUID when known at issuance.
The founder's current approval-key version and reserved slot are rechecked in SQL.
Acceptance creates membership, never a local password or automatic key. The recipient
signs in as an administrator and freshly enrolls their own keys. The invitation path is
an explicit post-login allowlist entry, preserved through Google PKCE or email verification
in the URL; it is never placed in browser storage. Ordinary Google administrator sign-in
returns to the administrator dashboard using the server-verified bound role. Existing secondary portals cannot be
promoted by supplying an email or identity field.

Manager password changes and closure requests require that manager's authenticated
account and current operation-key grant. In the native Supabase runtime, registered-account
deletion submits a review request using saved assignments, never mailbox-based purging.
Only an administrator's own approval key can decline or link it to an independently
authorized combined residence deletion proposal. Requests cannot bypass founder consent,
backups or execution gates. Primary callers receive 410. Resident self-service closure
requires the resident's own bound session and current portal PIN when enabled; otherwise
the native verified sign-in must be less than five minutes old. Confirmation and a fresh
owned-allocation fingerprint are mandatory; mailbox/password/ownership selectors are
rejected. Closure ends that allocation, closes only the resident context, revokes its app
bindings and rotates the room key. Auth sessions, sibling portals and history remain.
Native sign-in binding creation shares the housing lifecycle lock so it cannot recreate
resident bindings during closure. The closure response never clears provider cookies.
The legacy JSON/custom-session implementation is retired.

## Authentication Provider

Google login/signup uses Supabase's Google provider with a server-owned, five-minute,
single-use PKCE flow and an HttpOnly SameSite=Lax callback cookie. Enable Google in
Supabase, configure its Google client credentials there, and allow
`https://YOUR_PUBLIC_ORIGIN/api/auth/google/callback**` as a Supabase redirect URL
(including the callback's state query). Set `PINEVELA_PUBLIC_ORIGIN` for deployed
environments. A blank value also supports testing the built app with
`NODE_ENV=production npm run start` on localhost: the fallback accepts only a
loopback Host and an actual loopback socket peer, never forwarded host headers.
Allow `http://localhost:3001/api/auth/google/callback**` in Supabase Redirect URLs
(and the equivalent `127.0.0.1` URL if using that address). A deployed site still
requires its configured HTTPS origin and matching Supabase redirect allowlist.
See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

Both ordinary Google sign-in and signup always request `prompt=select_account`
without a `login_hint`, so Google's existing browser session does not silently
choose the last account. PineVela sign-out revokes the app session and clears its
cookies; Google's own browser session remains signed in. The next Google action
still asks for an account choice. Real-provider HTTP checks verify Supabase
forwards this prompt to Google and preserves callback state/cookie protections.

The server exchanges the code and reads the verified identity from Supabase `/user`.
The server resolves native profiles and account contexts by the verified Supabase
subject and live session. Shared email never selects or links a secondary portal.
Google signup can initialize an eligible native primary profile; it cannot import
legacy credentials or grant a secondary role. Current access restrictions and
maintenance still apply. Provider access/refresh tokens are confined to HttpOnly
cookies, never API profile data or browser storage; no local credential is generated.

Provider errors after consent are distinguished from a user denying access. An
`Unable to exchange external code` return is a Supabase-to-Google exchange failure;
check Supabase Auth logs and the Google provider's matching Web OAuth client ID/secret
and callback configuration. PineVela displays a provider failure, never a cancellation
for these errors. Callback query strings and error descriptions are excluded from
request logs; diagnostics contain only fixed failure categories.

Supabase Auth is the source of truth for authentication.

The application should not create a competing authentication authority.

---

## Identity

Authenticated users are represented through Supabase Auth.

Application-specific identity and profile information belongs in the application's profile system.

Conceptually:

```text
Supabase Auth User
        ↓
public.profiles
        ↓
Application role/profile
```

---

## Roles

Roles must not be trusted simply because they were supplied by the browser.

The server must obtain authoritative identity/authorization information from trusted sources.

---

## Authorization

Authentication answers:

> Who is this user?

Authorization answers:

> What is this user allowed to do?

These are separate concerns.

---

## Manager Authorization

Manager operations should follow:

```text
Authenticated session
        ↓
Manager profile
        ↓
Manager-hostel assignment
        ↓
Authorized operation
```

The client must not be able to select an arbitrary hostel and thereby gain access to it.

---

## Staff Creation

Only an authorized manager may create staff for their own authorized hostel.

The server must derive the manager identity from the authenticated session.

The server must verify the manager's hostel assignment.

The request body must not be the authority for manager identity or hostel authorization.

In the native Supabase runtime, staff enrollment starts from the assigned manager portal
and requires the current manager operation key and approved residence setup. The manager
receives a private invitation link; only its SHA-256 digest is stored. Links expire after
24 hours and can be renewed or cancelled by the initiating assigned manager. Renewing
revokes the previous link. No staff credentials or verified flags come from the manager.

Staff choose their own password through the invitation page. The Auth signup trigger
accepts only the saved invitation nonce, mailbox and still-authorized manager relationship.
The account stays pending until a live provider-verified session proves the invited subject
and confirmed work email. Confirmation does not switch the manager's cookie; staff sign
in separately. Email confirmation must remain enabled. See [Supabase signup behavior](https://supabase.com/docs/reference/javascript/auth-signup).

Existing registered addresses cannot be adopted through email equality. Rehiring an
existing closed staff identity and verified email changes remain explicit migration gates.
Self-profile edits currently allow display name and phone only. Suspension, removal and
resignation revoke staff portal bindings. Ended employment is retained with maintenance
history; restoration after suspension requires a fresh verified sign-in.


---

## Session Security

Sensitive operations must require a valid authenticated session.

Session revocation, expiration, and invalid sessions must be rejected.

### Native sessions

`pv_sb_access` and `pv_sb_refresh` are HttpOnly, SameSite=Strict cookies with Secure
in production. `/api/auth/me` verifies the provider identity, refreshes through the
provider when needed, and rechecks the live Auth session, active account-context
binding, role and policy in PostgreSQL. It returns no token material. Context or
ownership fields supplied by a client never create an authorization relationship.

Logout revokes the native binding/provider session and clears cookies. Closed,
revoked or suspended contexts fail immediately even if a JWT has not expired.
Portal PIN and manager/administrator key versions are rechecked inside authorized
transactions. Native CSRF checks deny cross-site writes; configure
`PINEVELA_PUBLIC_ORIGIN` for the deployed HTTPS origin.

The old `pv_auth_token` record-hash session store, one-day local TTL setting and
raw-token login responses are retired. The server clears an old cookie for
compatibility but never authenticates it. Exact native recovery, concurrency and
browser evidence is in the isolated acceptance report.

---

## Security Principle

Never treat:

```text
frontend role
frontend userId
frontend hostelId
frontend managerId
```

as authoritative security information.

Public catalog handoff: guest room activation and market orders carry an allowlisted
`next` selection through password login, verified signup, and the server-held Google
PKCE flow. Only `/user/dashboard` with a single residence, market item or store selection
is accepted; external redirects, secondary roles, and identity fields are rejected.
The authenticated dashboard reloads the actual catalog and opens the existing form.
Selecting a residence never claims a room: room-key authorization remains server-side.
Ordinary login keeps the existing default destination for the authenticated role.

Staff retention submission/final choices use the actual active staff portal. Manager
responses require its saved proposal recipient, current residence grant and operation
key. A final resignation closes employment and invalidates staff portal bindings; the
frontend signs out. Resident staff reviews require the resident portal’s current room
allocation, regardless of shared primary email or identity in another portal.

Meeting appointments belong to the saved assigned manager and exact internal housing
participant. Manager writes require a current residence grant and operation key;
participants may request for themselves or cancel their own appointment. Primary
portals, shared-email portals and uninvited staff gain no access. External contact
emails never create or select a portal identity. Suspended staff and released residents
lose access to their old appointment history through the housing portal.

Seller application submission uses a completed email-verification enrollment owned by
the primary session. Name and student email come from its confirmed Auth subject.
The application API rejects submitted passwords, owner IDs and identity aliases. Admin
review activates only the saved seller portal; store setup and verified payment remain
separate. Same-email resident/seller identities retain their separate portal PINs.


## Native profile edits

Migration 35 supports owned contact/picture edits without changing the verified credential
email, account owner or portal kind. Picture aliases project one persisted value; no Google
picture or previous user's cached avatar is used as another identity's fallback. The same
Auth subject shares its picture across portals; separately verified linked identities remain
independent. Active administrator identities must use the admin portal and settings key,
including when a primary portal also exists for that identity.

Profile editors upload custom pixels to private Storage before saving their owned reference.
`X-PineVela-Profile-Context` rejects requests that started under a different active portal;
it grants no authority. Editors ignore late responses after an account change or unmount. Profile updates also
pass the expected account ID to the functional Auth state update, which checks the
current account before applying a queued response.
Administrator #1 completed a genuine Google-session, settings-key-protected picture save
and identical-file retry on 2026-10-12; the browser reported success with its photograph
count unchanged. Native persistence and cross-administrator media ownership checks passed.
The isolated acceptance report records later local profile/browser checks; unlisted nested flows still require their own acceptance.

## Retained primary account after a normal wipe

Migration 61 allows a reviewed primary-only closure to retain the verified Google
identity, profile and account history while revoking primary application bindings.
Independent administrator access remains available. Ordinary login does not reopen
the primary portal; explicit Sign Up with Google uses a new server-verified PKCE
exchange and the original IDs, subject to retained bans and session epochs. Other
closed accounts cannot use this path. Migration 63 adds explicit verified email
code/link re-entry to the same retained primary portal; native identity/session, bans,
epochs and completed closure checks apply. Seller registration cycles are supplied
by migration 62. General operational closure remains unfinished. The live wipe
execution route stays disabled. See [primary lifecycle](migrations/primary-wipe-lifecycle.md).

Seller re-registration reuses the original separate verified student identity and
seller PIN. The original primary owner must provide fresh server-verified email
code/link or password proof plus the seller PIN where configured. Native session
invalidation, bans and original ownership still apply; the shared resident portal
is unaffected. See [seller re-registration](migrations/seller-reenrollment.md).

The primary email re-entry route derives identity from Supabase verification, selects
only the primary portal and never creates an Auth user or accepts ownership/role
selectors. Its receipt records the verified proof method. Positive email-only OTP
browser acceptance is still pending. See [email primary re-entry](migrations/primary-email-reentry.md).
## Customer-service access

Customer service uses the existing provider-verified primary sign-in plus a
private, administrator-invited membership. An account role or browser flag does
not grant access. Invitation acceptance checks the exact verified email, active
issuing administrator and current approval-key version. Suspension takes effect
on subsequent support requests, including requests with an already issued native
Auth session. See [customer-support.md](customer-support.md).

## Client authentication failures

API helpers reject every non-success HTTP response with a typed status/code;
they never turn a 401 mutation into an empty successful result. Only a rejected
current native session carries `sessionExpired: true` and clears browser identity.
A failed password/code proof for a separately invited identity does not clear the
current primary account. Staff invitation completion and staff removal also
require explicit server success receipts before updating their visible state.
