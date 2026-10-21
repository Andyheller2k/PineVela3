# Buyer–seller message encryption

New buyer–seller messages use end-to-end encryption. The browser encrypts before a request leaves the device and decrypts received messages locally. The API and PostgreSQL store an empty message body plus a signed ciphertext envelope. Notifications contain a generic inbox prompt, without a message preview. Support requests and email replies stay readable by authorized customer-service staff.

## Private recovery phrase

The first visit to Messages offers to create a private phrase (`pv1` and sixteen groups of four hexadecimal characters, containing 256 random bits). The user saves it before enabling encryption. A phrase-derived key encrypts the account's private identity backup locally; the server receives only public keys, that encrypted backup and a registration signature. A new device, page reload or sign-out requires the original phrase to unlock history. Password changes and customer service cannot recover it. There is no silent key reset that would make old messages unreadable.

Private keys are imported as nonextractable Web Crypto keys and held in memory. The phrase, raw private keys and decrypted messages are never written to localStorage, sessionStorage or IndexedDB. Account changes, logout and the Lock control clear the memory vault and rendered decrypted state. Public fingerprints alone are pinned in localStorage, separately for each account and contact. JavaScript garbage collection does not promise physical memory zeroization; byte buffers are overwritten where possible and secret string references are released.

Unchanged verified history is cached only in memory for that unlocked identity;
fingerprint checks still run before reuse. New decryptions run in batches of eight.
Lock/account changes/unmount clear the cache. Lock also clears recovery/generated
phrase fields, errors, confirmations and pending setup work, including late
cryptographic completion after a failed logout.

Both participants must enable encryption before a new message can be sent. Earlier plaintext history is retained and clearly labeled as sent before encryption. It is not retroactively encrypted or deleted. Existing message and identity retention guards also block direct SQL deletion; adding these records to a future reviewed full-account erasure workflow requires explicit dependency/backup review, rather than bypassing the guards.

## Protocol version 1

- Independent P-256 ECDH and ECDSA identity keys. SHA-256 fingerprints cover the canonical pair of public keys and protocol name.
- A new random 256-bit AES-GCM content key and 96-bit nonce for every message; a 128-bit authentication tag.
- A distinct ephemeral P-256 ECDH key for each participant's copy of the content key. HKDF-SHA-256 uses a random 256-bit salt and message/recipient-bound info, then AES-GCM wraps that one message key.
- The content ciphertext and each key envelope bind the immutable request UUID, buyer context, store, sender context, recipient context, protocol and identity fingerprints as additional authenticated data. ECDSA-SHA-256 signs the complete canonical envelope and binding. The server verifies that signature and actual saved participant keys before storing a message.
- A generated recovery phrase is high-entropy key material, not a user-chosen password. HKDF derives a backup key bound to account context and public fingerprint; AES-GCM additionally authenticates that context.

This is an application protocol built from the browser's standard Web Crypto primitives. It has **not received an independent cryptographic audit**, and does not implement Signal's Double Ratchet, forward secrecy or post-compromise security. A compromised private recovery phrase or unlocked browser can expose history. The application server remains trusted to serve authentic JavaScript; XSS or a malicious application update can access plaintext while a user reads it. Participant identities, timestamps, store, order and listing metadata remain visible to the server.

First contact uses trust on first use. The UI exposes both fingerprints for comparison through another trusted channel. Public-key material is checked against the fingerprint, and an established fingerprint change blocks sending/decryption. This detects subsequent substitution on the same browser, but is not a public transparency log or automatic out-of-band identity verification.

## Selected-message reports

An inbound message's Report control requires explicit consent. Only then does the client unwrap that selected message's random AES key. The report contains the stored message UUID and that one key, never a recovery phrase, identity key, conversation key or supplied plaintext. The server verifies the reporter is an original participant, authenticates/decrypts the exact stored ciphertext and retains the verified selected text in the restricted report evidence record. Customer service and administrators can read that disclosed evidence. Unreported messages remain encrypted. A disclosed key cannot decrypt a different message.

## Verification

`node --import tsx tests/marketEncryption.test.ts` exercises real Web Crypto round trips, sender/recipient/outsider isolation, account-bound phrase recovery, nonextractable keys, signature/AAD/ciphertext changes, vault clearing and disclosure isolation.

`node --import tsx scripts/verify-supabase-local-encryption.ts <owned-local-metadata>` uses real native Supabase signup, captured email verification, seller enrollment/approval, Storage and application APIs. It verifies immutable keys, SQL privilege/RLS boundaries, ciphertext-only sends, rejected forged and plaintext requests, idempotency, non-preview notifications, sender/recipient decryptability, independent SQL denial and recovery after a genuine new login. Its private fixture supports subsequent moderation and browser checks. It refuses remote database/provider endpoints and writes no hosted customer records.

`scripts/verify-supabase-encryption-browser.cjs` checks actual browser phrase recovery, historical decryption, encrypted network requests, mobile layout, explicit selected-message reporting and logout/account isolation. `scripts/verify-supabase-encryption-compatibility.ts` exercises the shared encryption adapter used by earlier isolated conversation/workflow regression scripts, using the same genuinely enrolled local accounts.

Primary references: [W3C Web Cryptography](https://www.w3.org/TR/webcrypto/), [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

Verified on 17 October 2026: 52 native encryption/API/security checks, 10 native
regression-adapter checks and 20 real-browser checks passed. Browser checks cover
phrase recovery, held real-crypto lock races, secret-field clearing, ciphertext-only
network sends, zero repeated decrypts for unchanged history, selected-message
disclosure consent, mobile layout and genuine logout/account isolation. TypeScript,
Web Crypto unit checks and the final frontend/backend build passed. Hosted
installation verification confirms all 73 migration digests and private guards
without modifying customer records.

History reads default to 50 messages (maximum 100). `before` and `after` cursors retain PostgreSQL microseconds and the UUID tie breaker; they filter the session's existing participant scope and cannot select another account. The inbox merges incremental polling results by message ID. Older conversations and messages remain available through **Load older history**; decrypted entries are cached only in account-scoped memory and cleared on lock/sign-out.
