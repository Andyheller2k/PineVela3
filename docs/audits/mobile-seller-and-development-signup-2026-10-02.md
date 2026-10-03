# Mobile seller inbox and development signup follow-up — 2026-10-02

Scope: the previously incomplete mobile seller browser check and the reported missing local signup code. No repeat cleanup, full audit, operational-data changes, commit or push.

## Local signup

The existing cryptographic six-digit generator passes the focused tests. The old `npm run dev` command did not watch backend or environment-file changes, so frontend updates could coexist with an older server handler. It also inherited `NODE_ENV` from the shell.

`npm run dev` now explicitly selects development and watches backend dependencies plus `.env`; runtime data, uploads and build output are excluded. Restart the existing development command once to apply this change. The existing opt-in `PINEVELA_DEV_SIGNUP_CODES=true` remains required. Production/builds and non-local requests still cannot use development codes.

The browser test starts the actual npm development command with an inherited production environment to verify that explicit development selection works. It confirms the displayed six-digit code, Use this code, activation and login. Development accounts remain unverified and development-only. The user's original running process was unavailable for direct inspection, so stale-server or inherited-environment configuration is a supported explanation rather than a confirmed diagnosis of that process.

## Seller browser verification

The focused browser regression initializes the authenticated seller session before loading the app, waits for the correct route and control, and uses a fresh page for signup. It checks 375px, 390px, 768px and 1440px, buyer inquiry visibility, seller reply, conversation back navigation, reload persistence and horizontal overflow. The earlier landing-page failure was not reproduced with this controlled session setup; no speculative application-routing patch was made.

## Results

- Focused development signup unit/integration tests: **4 passed**, including restart and production rejection.
- Development browser run: **passed**; seller inbox at all four widths and visible signup code/activation/login. No console/runtime errors or failed API requests.
- Production-bundle seller browser run: **passed** at all four widths, including reply, back navigation and reload. No console/runtime errors or failed API requests.
- Private-data and diff whitespace checks: **passed**.

All browser/API test records are confined to a disposable temporary database. No mock handlers or placeholder application content were added.

Re-run only these checks with:

```bash
node --import tsx --test tests/developmentSignup.test.ts tests/developmentSignup.integration.test.ts
node tests/mobileSellerSignup.browser.cjs
node tests/mobileSellerSignup.browser.cjs --production
```
