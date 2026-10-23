# Install PineVela on a phone

The ordinary website keeps its landing page on phones, tablets and computers.
On phone/tablet layouts, **Install app** is available in the public and login
headers. A supported browser opens its native install prompt after a tap;
otherwise the button explains the browser's installation steps. iPhone/iPad
instructions use Safari → Share → Add to Home Screen, with Open as Web App
enabled when offered. Users confirm installation themselves.

The manifest starts the installed app at `/#/login` with the actual PineVela
logo, deep-blue launch background and standalone display mode. An installed
launch is detected by `display-mode: standalone` or iOS `navigator.standalone`.
Screen width alone never changes website routing. Installed mode redirects
landing/Why Us routes to login and removes links to those pages. Login, signup,
recovery, Help/FAQ, invitations, payment returns and existing product routes
remain available with their existing access checks. An authenticated session
still follows the normal account dashboard flow.

Installation requires an HTTPS deployment (loopback is supported for local
development). This prepares the existing web app for home-screen installation;
it does not publish an App Store/Play Store app or deploy `pinevela.app`.

## Privacy and updates

The service worker is online-only. It does not use Cache Storage, IndexedDB or
localStorage. It intercepts only same-origin root/index document navigations,
requests them with `cache: no-store`, and returns a fixed offline notice on a
network failure. API calls, authentication, media, messages and other subresources
are never intercepted or cached by the worker. Existing HTTP and account cache
policies remain in force. The worker never reloads an open form during updates.

Manifest, worker and generated icon routes return exact public files with
explicit MIME types and `no-store`; a missing worker returns 404, not SPA HTML.
There are no database migrations or authorization changes for this feature.

## Verification

Focused tests cover installed-mode signals/routing, actual manifest/icon files,
static delivery and worker privacy/offline behavior. Browser checks should cover
375/768/1440px website layouts, installed-mode routing and Help, manifest
installability, worker registration, offline navigation and empty Cache Storage.
Emulating a standalone browser is not proof of physical iPhone/Android
installation; complete that device check after deploying the HTTPS website.

Run `npm run test:pwa` and, against an owned running loopback preview,
`npm run verify:pwa-browser -- http://127.0.0.1:3001`. The browser script uses a
disposable Chromium profile, submits no credentials and performs no account writes.

On 22 October 2026 the focused suite passed 10 checks, full TypeScript and the
frontend/backend builds passed, and the final isolated Chromium run passed 40
checks. The browser used iOS's `navigator.standalone` launch signal as an explicit
environment override; physical device installation was not claimed. Real page
and worker network targets were taken offline, the fixed notice appeared, and
online recovery worked with zero Cache Storage entries and zero account writes.
Local publication scanned 149 public text files against configured private values
with no matches and preserved previous hashed assets and rollback material.

Two related dashboard fixes were included: remove the duplicate header action
for room-key activation while retaining **Verify Room Key & Start Onboarding**,
and center the desktop top navigation with equal side offsets/automatic margins.
The previous translate-based centering was overwritten by its entrance animation.
Forty-one actual navigation-component/CSS browser checks reproduced that shift
and verified the fix at 1024–1920px in both themes, with the mobile behavior
preserved at 375/768px. No account profile was fabricated; this isolated layout
check did not sign into an authenticated dashboard.

References: [web app installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable),
[browser install prompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event),
[Apple home-screen instructions](https://support.apple.com/en-euro/guide/iphone/iph42ab2f3a7/ios).
