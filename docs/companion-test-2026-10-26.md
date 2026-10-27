# Companion test — 26 October 2026

Cloudflare Workers AI returned a complete visible reply from development at
12:15:25 UTC through the retained companion's actual transport, full app
instructions and configured tool definitions.

- Model: `@cf/openai/gpt-oss-20b`.
- One fixed, non-personal greeting; no account data or database operations.
- Complete reply: 16 visible characters, `stop`, no tool calls.
- Usage: 1,146 total tokens; elapsed time: 8,657 ms.
- Credentials were read from the existing private environment, without printing
  them or changing any private settings.

The seven companion test files passed: inference, server provider consent,
client consent, submission recovery, state loading, private host diagnostics
and existing companion behavior. Those protocol tests make no provider calls.
The existing recipient disclosure and explicit Cloudflare acknowledgment remain
required before account messages can be sent to the new provider.

This result establishes local inference only. No hosting upload, remote
diagnostic, signed-in browser chat or production account write was performed.
The owner subsequently authorized restoring Ask AI for hosted testing before
hosting success is established. The tab and desktop launcher are now mounted.
Run the prepared private Cloudflare diagnostic from the Spaceship application
directory and confirm `visible_reply_received`; see
[Cloudflare setup](cloudflare-companion-setup.md).

## Prepared hosting test update

`/tmp/pinevela-preview-cloudflare-ai-test-20261026.tar.gz` contains the current
compiled API backend, the freshly compiled private Cloudflare diagnostic and
upload/run instructions. Extract into `/home/jqmgxgpuym/pinevela-app`, preserving
private settings, existing assets and dependencies. Back up the existing API
bundle and hosted `package.json` privately first. Restart Node after applying
the backend/private settings, then run the diagnostic once as described in the
included instructions. No migration or dependency installation is needed.

- Size: 222,953 bytes.
- SHA-256: `a551c8a0202e0fe4412818af6d33b261e5836c22ae43e9402e34ed061aefac59`.
- Exactly three regular files; no environment file, source maps or dependencies.
- Archived backend/diagnostic bytes match the current build; all members passed
  a scan against configured private credential values.
- Both compiled JavaScript syntax checks passed. No remote upload occurred.
