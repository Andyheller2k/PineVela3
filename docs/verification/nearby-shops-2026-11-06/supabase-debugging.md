# Observability

Read project data, diagnose issues, and run agent prompts to check your project

Use project data to understand what is happening, investigate issues, and give an agent repeatable checks to run.

## Read project data

Query logs for events, inspect database statistics, or review advisor findings. Use Reports to visualize signals and the [Metrics API](https://supabase.com/docs/guides/observability/metrics) to export them.

- **[Query logs with SQL](https://supabase.com/docs/guides/observability/advanced-log-filtering):** Query ClickHouse events through MCP, the API, or Explorer.
- **[Logs in Studio](https://supabase.com/docs/guides/observability/logs):** Filter, inspect, and export events in the unified Logs view.
- **[Log sources and fields](https://supabase.com/docs/guides/observability/log-field-reference):** Look up sources, ClickHouse query fields, and capture limits.
- **[Metrics API](https://supabase.com/docs/guides/observability/metrics):** Scrape Prometheus-compatible database metrics, or chart a subset in Reports.
- **[Inspect the database](https://supabase.com/docs/guides/observability/inspect):** Inspect live Postgres stats from the CLI, Explorer, or MCP.
- **[Advisors](https://supabase.com/docs/guides/observability/advisors):** Pull security and performance findings from Studio, MCP, the CLI, or the API.
- **[Reports](https://supabase.com/docs/guides/observability/reports):** Studio dashboards for API, Auth, Storage, Realtime, and database signals.

## Detect and diagnose

Run [detection checks](https://supabase.com/docs/guides/observability/detecting) to identify health, security, performance, or capacity issues. Take the resulting error code, time window, or affected object to the [troubleshooting guides](https://supabase.com/kb/topics/troubleshooting), then rerun the check after a fix.

## Agent prompts

Give an agent a prompt to check your project and report issues to fix. [See the prompts](https://supabase.com/docs/guides/observability/automate-with-agents) and run them with read-only access to your project.

- **[Health](https://supabase.com/docs/guides/observability/automate-with-agents/health):** Once per hour. Check API and Auth server errors and connection pressure.
- **[Security](https://supabase.com/docs/guides/observability/automate-with-agents/security):** Once per day. Review advisor findings and authorization failures.
- **[Performance](https://supabase.com/docs/guides/observability/automate-with-agents/performance):** Once per hour. Review sessions, query regressions, and performance advisors.
- **[Resources](https://supabase.com/docs/guides/observability/automate-with-agents/usage):** Once each morning. Track sizes, connections, request growth, and supported forecasts.

## Configure and export

Record additional events or send telemetry to your monitoring tools.

- **[Configure logging](https://supabase.com/docs/guides/observability/configure-logging):** Record additional Postgres and Realtime events.
- **[Log drains](https://supabase.com/docs/guides/observability/log-drains):** Send project logs to your own destination.
- **[Client-side tracing](https://supabase.com/docs/guides/observability/client-side-tracing):** Propagate W3C trace context from the client through Supabase services.
- **[Sentry integration](https://supabase.com/docs/guides/observability/sentry-monitoring):** Capture supabase-js errors and spans in Sentry.
