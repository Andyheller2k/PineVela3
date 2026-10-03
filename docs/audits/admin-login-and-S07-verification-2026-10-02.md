# Administrator login and S07 verification — 2026-10-02

The existing administrator record retains the administrator role and is not a pending manager. A metadata-only check confirmed that its current credential matches a password explicitly disabled by the legacy credential policy. No password, hash or session value was printed. The login API rejects disabled legacy credentials with HTTP 403 and `requiresPasswordReset: true`.

The login UI incorrectly mapped every HTTP 403, and loosely matched words in error messages, to the pending-approval modal. It now opens that modal only when the server explicitly supplies `isPendingApproval: true`. Credential recovery errors appear inline. Manager approval remains enforced by the server.

The existing disabled-credential lists were moved into a shared server-only module. Offline recovery now rejects these passwords before modifying an account, preventing a successful reset to a password that login would immediately reject. Existing accounts, roles, credentials and operational data were not changed during this work. The administrator must stop the app, use the existing interactive recovery command with a fresh unique password, and restart it. Passwords should not be supplied in command arguments or chat.

S07 remains resolved: the supported staff endpoint is manager-only, requires explicit credentials and has no fallback password. Missing-password creation is rejected with HTTP 400; authorized creation and login succeed. Administrator, primary-user and cross-manager staff creation remain blocked.

## Verification

- Five focused security tests passed: credential containment/recovery, disabled-password recovery rejection, manager approval, and retired-feature/staff/account isolation regressions, including server restarts.
- Real Chromium against a disposable database: disabled legacy login returns a recovery error inline without the approval modal; a pending manager still receives the approval modal; a recovered administrator signs in and reaches the administrator dashboard. Wrong-password API login returns HTTP 401. No browser runtime errors; only the intentional denied login requests failed.
- TypeScript check, production build, private-data check and whitespace check passed. The build reports a bundle-size advisory.
- Test data existed only in temporary isolated databases and was removed. The operational administrator password was not reset and its active server session was not tested.

Run recovery with the application stopped:

```bash
cd /home/wyse/Documents/PineVela3
node --import tsx scripts/credential-recovery.ts reset andyheller2k@gmail.com admin
npm run dev
```

Enter a new, unique password at the hidden prompts, rather than reusing the disabled password.
