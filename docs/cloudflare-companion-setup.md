# Cloudflare companion test

Ask AI is restored for Spaceship testing at the owner's request on 2026-10-26.
Cloudflare Workers AI has returned a real reply locally; hosting is unverified. The
companion keeps its existing account boundaries, consent, saved history, app
scope and read-only tools. No database migration or domain/nameserver transfer
is needed. OpenRouter is a later test if Cloudflare cannot serve the app; there
is no automatic provider fallback.

The restored UI discloses Cloudflare as the selected recipient
and obtain the provider confirmation required by the server before enabling
replies. A past Groq opt-in does not silently authorize a different recipient.

## Private credentials

1. In Cloudflare, open **Workers AI → Use REST API → Create a Workers AI API
   Token**. Use the prefilled template for the intended account. A custom token
   needs **Workers AI — Read** and **Workers AI — Edit** permissions.
2. Copy that account's **Account ID** from the same page.
3. Save the following settings in PineVela's private `.env`, filling the token
   and account ID there. Keep credentials out of chat and frontend variables.

   ```dotenv
   COMPANION_AI_PROVIDER=cloudflare
   CLOUDFLARE_API_TOKEN=
   CLOUDFLARE_ACCOUNT_ID=
   ```

4. Keep the account on **Workers Free** for this test. Its shared free allowance
   is 10,000 neurons daily, not 10,000 messages. Do not enable a paid plan to run
   the test. The selected model is `@cf/openai/gpt-oss-20b`.

The token and Account ID are distinct from Turnstile site/secret keys. The
[official setup guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
documents their creation. Cloudflare documents the
[free allowance](https://developers.cloudflare.com/workers-ai/platform/pricing/),
[selected model](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/)
and [OpenAI-compatible endpoint](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/).

## Local and hosting probe

`scripts/diagnose-cloudflare-companion.ts` and its compiled
`deploy/spaceship/diagnose-cloudflare-companion.cjs` make **one inference attempt**
through PineVela's actual companion transport, full instructions and configured
tools. The prompt is a fixed, non-personal greeting. Each run consumes some of
the provider's free allowance. It reads no account data and performs no database
operations. It does not accept alternative prompts, destinations or flags.

The result includes safe configuration/source flags, UTC time, model, elapsed
time, finish reason and visible reply length. It never prints the token, account
ID, message/reply text, hidden reasoning, raw provider response or error stack.
`passed: true` and `conclusion: "visible_reply_received"` indicate a complete
reply from that machine; local success does not establish hosting success.

After the prepared update is uploaded, extract it into
`/home/jqmgxgpuym/pinevela-app`, preserving private files and existing assets.
Add the same private settings to the hosted `.env`. If cPanel's Node application
also defines those names, update the override values there as well. Restart
Node to apply the server settings.

In the hosted `package.json`, change only the existing script command:

```json
"diagnose:companion": "node diagnose-cloudflare-companion.cjs"
```

Keep the surrounding JSON valid and preserve the rest of `package.json`.
Refresh cPanel's Node page, run **diagnose:companion** once and share only the
diagnostic output. Do not upload the repository `package.json` over the hosted
one merely to change this command. With a terminal, the equivalent command is
`node diagnose-cloudflare-companion.cjs` from the application directory.

The probe is a private CLI, not a public HTTP endpoint. Actual token access,
hosting connectivity and a complete reply must be verified before declaring the
provider operational. The restored tab allows the owner to test and debug hosting.
