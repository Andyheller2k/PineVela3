# Supabase advisor review — 27 October 2026

Supabase MCP OAuth sign-in completed. The configured, enabled MCP endpoint was
verified as `https://mcp.supabase.com/mcp` scoped to project
`bivajljcdeofyxzmplxm`, matching the existing application database configuration.
Both Security and Performance Advisor calls succeeded. Those calls were limited
to `get_advisors`; the follow-up database inspection was read-only metadata.

| Advisor | Errors | Warnings | Informational |
| --- | ---: | ---: | ---: |
| Security | 0 | 3 | 53 |
| Performance | 0 | 1 | 141 |
| Total | 0 | 4 | 194 |

The remaining warnings are:

- `public.rls_auto_enable()` has SECURITY DEFINER execution privileges for both
  `anon` and `authenticated` (two warnings). Live metadata confirms that it
  returns `event_trigger` and has one event-trigger binding. Review its grants
  while preserving that binding; the advisor finding alone does not prove that
  the event-trigger function can be called as an ordinary RPC.
- Supabase Auth leaked-password protection is disabled. This feature requires
  Pro or above according to the [password security documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  No plan upgrade or Auth configuration change was performed.
- `public.media_assets` has three permissive SELECT policies for `authenticated`:
  `avatar_account_read`, `media_account_read`, and `media_order_buyer_read`.
  Any optimization must preserve all existing authorization predicates.

The 53 security informational findings concern private tables with RLS enabled
and no policies. Live inspection confirmed zero SELECT grants to either `anon`
or `authenticated` on those tables. This is consistent with the project's
server-controlled access model; adding permissive policies merely to clear the
messages would change that boundary. The performance informational findings
comprise 107 foreign keys lacking covering indexes and 34 unused-index reports.
Those require workload-specific review rather than bulk index changes.

The complete returned finding inventory is
`/tmp/pinevela-supabase-advisors.txt`; metadata evidence is
`/tmp/pinevela-advisor-metadata-review.json`. The reader's original inventory
notes that the tool response does not include a project ID; the configured
project-scoped endpoint was independently checked afterward as described above.
No returned finding names `private.account_appearance`.

The appearance migration's exact live ledger digest was reconfirmed:
`5d1c055a08bef478be37f24651d1e5b12918dfb78550a40a82a7b3ece23b8dbf`.
The theme migration remains applied and verified. This advisor review made no
additional database, permission, policy, index or Auth-setting changes.
