# Ask AI on Spaceship — 26 October 2026

Ask AI is restored at the owner's explicit request so it can be tested
and debugged on Spaceship. A complete Cloudflare reply already passed locally;
hosted inference and a signed-in hosted conversation are still unverified.
The prior instruction to keep the UI paused until hosting succeeds is superseded
by this request. Existing account boundaries, recipient consent and allowances
remain in force. There is no automatic provider fallback.

## Apply the update and private settings

1. Back up the current hosted API bundle and `package.json` privately. Extract
   the restored-Ask-AI update into `/home/jqmgxgpuym/pinevela-app`, preserving
   private files, dependencies and existing assets.
2. The tested companion-only settings have been prepared locally in
   `.security/spaceship-companion-20261026/cloudflare-companion.env`. This private
   file contains exactly the provider selection, Workers AI token and Account ID.
   Copy its three settings into the **existing hosted private `.env`**. Replace
   matching settings there rather than adding duplicates. Do not replace the
   whole hosted `.env`; its database, authentication and other settings are needed.
   Keep this credential file outside public directories and update archives.
3. In cPanel's Node application environment settings, reconcile any overrides
   for `COMPANION_AI_PROVIDER`, `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` with the private `.env`. Process environment values
   take precedence, including explicitly empty values.
4. Retain the existing **Node 22**, **Production** application mode and
   **`app.cjs`** startup file. Restart the Node application after applying the
   backend or private settings. No migration or dependency installation is needed.
5. Refresh the browser, or fully close and reopen the installed app, to load the
   restored frontend.

The private settings file has a 0700 parent directory and 0600 file permissions.
Its dotenv roundtrip and Cloudflare provider configuration were verified without
printing credentials. No existing private environment was overwritten and no
remote settings were changed by this preparation.

## Test the restored tab

Sign in to the primary user dashboard and open **Ask AI**. Mobile/tablet users
use the bottom navigation; desktop users use its launcher. The disclosure must
name **Cloudflare Workers AI**. Use **Enable AI replies** or **Enable AI & send**
to confirm this recipient, then send one short greeting. A prior Groq preference
does not silently authorize Cloudflare.

Check that the reply finishes, remains visible after reopening the companion,
and that navigation and closing the dialog still work. If a request fails,
share its visible error and whether the draft was preserved. Do not share the
private environment or credentials.

## Optional private hosting diagnostic

From the application directory, run:

```sh
node diagnose-cloudflare-companion.cjs
```

For cPanel's script runner, change only the existing hosted script command to:

```json
"diagnose:companion": "node diagnose-cloudflare-companion.cjs"
```

Keep the rest of the hosted `package.json` intact, refresh cPanel's Node page,
and run **diagnose:companion** once. Each run sends one fixed nonpersonal greeting
and uses some provider allowance. It performs no database operations. Success is
`passed: true` with `conclusion: "visible_reply_received"`. Share only the safe
diagnostic output for debugging; it omits credentials, message text and raw
provider responses.

## Prepared update and verification

`/tmp/pinevela-spaceship-ask-ai-restored-20261026.tar.gz` contains the restored
frontend, current API bundle, `app.cjs`, Cloudflare diagnostic and these safe
testing instructions. It includes the preceding product UI fixes.

- Size: 8,160,233 bytes; 175 files, including 171 public frontend files.
- SHA-256: `b330834c94a6f23e3f83ff606e2eed1758d3960fabcd1ecea76293243d9717a4`.
- Every archived file was byte-verified; configured private credential scan
  found zero matches. No private configuration, source maps or dependencies are
  included. The frontend index is the final archive member.
- The built frontend contains the desktop/mobile Ask AI launchers, companion
  endpoint, Cloudflare disclosure and explicit recipient-consent header.
- TypeScript, full production build and eight existing companion/UI test files
  passed. An isolated Chromium navigation check passed 409 checks across 24
  scenes, including the restored five-destination mobile bar.
- The three-setting private configuration remains separate at
  `.security/spaceship-companion-20261026/cloudflare-companion.env`; merge it
  into the existing hosted `.env` as described above.

The archive is prepared locally and has not been deployed. The layout checks
do not establish a genuine signed-in hosted conversation or physical iPhone
rendering; those are the next tests after applying the update. Documentation
package metadata was added after packaging; the archive contains the same
deployment/testing instructions without this metadata section.
