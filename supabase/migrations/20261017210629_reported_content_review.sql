-- Reports are linked to the existing support case workflow. No policy or
-- destructive capability is granted to customer-service accounts.
create table private.content_reports (
 ticket_id uuid primary key references private.support_tickets(id),
 reporter_context_id uuid not null references public.account_contexts(id),
 target_type text not null check(target_type in('profile','store','listing','message')),
 target_id uuid not null, target_context_id uuid not null references public.account_contexts(id),
 target_kind text not null, target_name text not null check(length(target_name) between 1 and 300),
 reason text not null check(reason in('fake_item','broken_item','false_name','false_identity','false_location','scam','harassment','unsafe','other')),
 details text not null check(length(details) between 10 and 6000), request_fingerprint text not null check(length(request_fingerprint)=64),
 status text not null default 'submitted' check(status in('submitted','recommended','escalated','dismissed')),
 version integer not null default 1 check(version>0), created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index content_reports_reporter on private.content_reports(reporter_context_id,created_at desc,ticket_id);
create index content_reports_target_account on private.content_reports(target_context_id);
create index content_reports_queue on private.content_reports(status,updated_at desc,ticket_id);
create table private.content_report_evidence (
 ticket_id uuid primary key references private.content_reports(ticket_id), message_id uuid not null,
 message_snapshot jsonb not null, plaintext text not null check(length(plaintext) between 1 and 5000),
 encrypted boolean not null, sender_name text not null, consent_context_id uuid not null references public.account_contexts(id),
 consent_at timestamptz not null default clock_timestamp(), created_at timestamptz not null
);
create table private.content_report_recommendations (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null unique references private.content_reports(ticket_id),
 action text not null check(action in('no_action','warning','ban','restrict','restore','delete','remove_listing')),
 reason text not null check(length(reason) between 10 and 2000), author_context_id uuid not null references public.account_contexts(id),
 request_key uuid not null, created_at timestamptz not null default clock_timestamp()
);
create table private.content_report_decisions (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null unique references private.content_reports(ticket_id),
 decision text not null check(decision in('dismiss','escalate')), reason text not null check(length(reason) between 10 and 2000),
 administrator_context_id uuid not null references public.account_contexts(id), proposal_id uuid references public.admin_proposals(id),
 created_at timestamptz not null default clock_timestamp()
);
create table private.content_report_events (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references private.content_reports(ticket_id),
 actor_context_id uuid not null references public.account_contexts(id), event_type text not null,
 details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create index content_report_evidence_consent on private.content_report_evidence(consent_context_id);
create index content_report_recommendations_author on private.content_report_recommendations(author_context_id);
create index content_report_decisions_admin on private.content_report_decisions(administrator_context_id);
create index content_report_decisions_proposal on private.content_report_decisions(proposal_id) where proposal_id is not null;
create index content_report_events_ticket on private.content_report_events(ticket_id,created_at);
create index content_report_events_actor on private.content_report_events(actor_context_id);
create function private.guard_content_report_history() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='content_reports' and TG_OP='UPDATE' then
  if (to_jsonb(new)-'status'-'version'-'updated_at') is distinct from (to_jsonb(old)-'status'-'version'-'updated_at') then
   raise exception using errcode='42501',message='Original report identity and evidence are immutable';end if;
  return new;
 end if;
 raise exception using errcode='42501',message='Moderation evidence and review history are retained';
end;$$;
create trigger content_report_identity before update or delete on private.content_reports for each row execute function private.guard_content_report_history();
create trigger content_report_evidence_history before update or delete on private.content_report_evidence for each row execute function private.guard_content_report_history();
create trigger content_report_recommendation_history before update or delete on private.content_report_recommendations for each row execute function private.guard_content_report_history();
create trigger content_report_decision_history before update or delete on private.content_report_decisions for each row execute function private.guard_content_report_history();
create trigger content_report_event_history before update or delete on private.content_report_events for each row execute function private.guard_content_report_history();
alter table private.content_reports enable row level security;
alter table private.content_report_evidence enable row level security;
alter table private.content_report_recommendations enable row level security;
alter table private.content_report_decisions enable row level security;
alter table private.content_report_events enable row level security;
revoke all on private.content_reports,private.content_report_evidence,private.content_report_recommendations,private.content_report_decisions,private.content_report_events from public,anon,authenticated,pinevela_catalog,pinevela_backend;
grant select on private.content_reports,private.content_report_evidence,private.content_report_recommendations,private.content_report_decisions,private.content_report_events to pinevela_backend;
create policy content_reports_scoped_read on private.content_reports for select to pinevela_backend
 using(reporter_context_id=private.current_context_id() or private.support_operator());
create policy content_report_evidence_operator_read on private.content_report_evidence for select to pinevela_backend using(private.support_operator());
create policy content_report_recommendations_operator_read on private.content_report_recommendations for select to pinevela_backend using(private.support_operator());
create policy content_report_decisions_operator_read on private.content_report_decisions for select to pinevela_backend using(private.support_operator());
create policy content_report_events_operator_read on private.content_report_events for select to pinevela_backend using(private.support_operator());
revoke all on function private.guard_content_report_history() from public,anon,authenticated,pinevela_backend;
