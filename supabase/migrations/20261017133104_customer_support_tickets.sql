-- Customer support is a private case workflow, separate from buyer/seller chat.
-- An invited, provider-verified primary identity receives a revocable membership;
-- neither browser claims nor public signup can grant customer-service authority.
create table private.support_invitations (
 id uuid primary key default gen_random_uuid(), email text not null check(email=lower(email) and length(email)<=254),
 full_name text not null check(length(full_name) between 1 and 120), token_digest text not null unique check(length(token_digest)=64),
 issuer_context_id uuid not null references public.account_contexts(id), approval_key_version uuid not null,
 reserved_subject_id uuid references auth.users(id), status text not null default 'pending' check(status in('pending','accepted','cancelled')),
 accepted_context_id uuid references public.account_contexts(id), created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval'24 hours', accepted_at timestamptz,
 check((status='accepted')=(accepted_context_id is not null and accepted_at is not null))
);
create unique index support_one_pending_invitation on private.support_invitations(email) where status='pending';
create table private.support_memberships (
 context_id uuid primary key references public.account_contexts(id), invitation_id uuid not null unique references private.support_invitations(id),
 status text not null default 'active' check(status in('active','suspended')),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create function private.support_issuer_valid(i private.support_invitations) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
  join private.admin_secrets k on k.context_id=m.context_id
  where m.context_id=i.issuer_context_id and m.status='active' and c.kind='admin' and c.status='active'
   and k.approval_key_hash is not null and k.approval_key_version=i.approval_key_version);
$$;
create function private.support_operator() returns boolean language sql stable set search_path='' as $$
 select private.current_kind()='admin' or exists(select 1 from private.support_memberships m
  where m.context_id=private.current_context_id() and m.status='active');
$$;
create function private.guard_support_membership() returns trigger language plpgsql set search_path='' as $$
declare i private.support_invitations;
begin
 if TG_OP='INSERT' then
  select * into i from private.support_invitations where id=new.invitation_id for update;
  if i.status<>'pending' or i.expires_at<=clock_timestamp() or not private.support_issuer_valid(i)
   or i.token_digest is distinct from current_setting('pinevela.support_invitation_digest',true)
   or private.current_kind()<>'primary' or new.context_id is distinct from private.current_context_id()
   or not exists(select 1 from auth.users u join public.account_contexts c on c.auth_user_id=u.id
    where c.id=new.context_id and c.status='active' and c.kind='primary' and u.id=auth.uid()
     and lower(u.email)=i.email and u.email_confirmed_at is not null and not u.is_anonymous
     and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
     and (i.reserved_subject_id is null or i.reserved_subject_id=u.id))
   or exists(select 1 from public.account_contexts c where c.auth_user_id=auth.uid() and c.kind<>'primary') then
   raise exception using errcode='42501',message='A live verified customer-service invitation is required';
  end if;
 elsif TG_OP='UPDATE' then
  if private.current_kind() is distinct from 'admin'
   or not exists(select 1 from private.admin_secrets k where k.context_id=private.current_context_id()
    and k.approval_key_hash is not null and k.approval_key_version::text=current_setting('pinevela.approval_key_version',true))
   or (new.context_id,new.invitation_id,new.created_at) is distinct from (old.context_id,old.invitation_id,old.created_at) then
   raise exception using errcode='42501',message='Only an administrator can change customer-service access';end if;
 else raise exception using errcode='42501',message='Customer-service membership history is retained';end if;
 return new;
end;$$;
create trigger support_membership_guard before insert or update or delete on private.support_memberships for each row execute function private.guard_support_membership();

create table private.support_tickets (
 id uuid primary key default gen_random_uuid(), reference text not null unique default 'PV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 requester_context_id uuid references public.account_contexts(id), requester_kind text,
 requester_name text not null check(length(requester_name) between 1 and 120), requester_email text not null check(length(requester_email)<=254),
 guest_token_digest text check(length(guest_token_digest)=64), request_key uuid not null,
 type text not null check(type in('question','complaint','report')),
 category text not null check(category in('marketplace','residence','maintenance','account','payments','technical','other')),
 subject text not null check(length(subject) between 3 and 160), source text not null check(length(source)<=300),
 status text not null default 'open' check(status in('open','in_progress','awaiting_user','resolved','closed')),
 priority text not null default 'normal' check(priority in('normal','high')),
 assigned_to uuid references private.support_memberships(context_id), version integer not null default 1 check(version>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((requester_context_id is null and requester_kind is null and guest_token_digest is not null)
  or(requester_context_id is not null and requester_kind is not null and guest_token_digest is null))
);
create unique index support_request_idempotency on private.support_tickets(coalesce(requester_context_id,'00000000-0000-0000-0000-000000000000'::uuid),request_key);
create index support_own_cases on private.support_tickets(requester_context_id,updated_at desc,id);
create index support_queue on private.support_tickets(status,updated_at desc,id);
create index support_guest_budget on private.support_tickets(lower(requester_email),created_at) where requester_context_id is null;
create table private.support_messages (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references private.support_tickets(id), request_key uuid not null,
 author_context_id uuid references public.account_contexts(id), author_name text not null check(length(author_name) between 1 and 120),
 author_role text not null check(author_role in('requester','agent','admin')), internal boolean not null default false,
 body text not null check(length(body) between 3 and 6000), created_at timestamptz not null default clock_timestamp(),
 unique(ticket_id,request_key), check(not internal or author_role in('agent','admin'))
);
create index support_message_thread on private.support_messages(ticket_id,created_at,id);
create table private.support_events (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references private.support_tickets(id),
 actor_context_id uuid references public.account_contexts(id), event_type text not null,
 details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
create table private.support_email_outbox (
 id uuid primary key default gen_random_uuid(), message_id uuid not null unique references private.support_messages(id),
 ticket_id uuid not null references private.support_tickets(id), recipient_email text not null,
 subject text not null, body text not null, status text not null default 'queued' check(status in('queued','sending','sent','failed')),
 attempts integer not null default 0, available_at timestamptz not null default clock_timestamp(), lease_until timestamptz,
 provider_id text, last_error text, created_at timestamptz not null default clock_timestamp(), sent_at timestamptz
);
create index support_email_work on private.support_email_outbox(available_at) where status in('queued','sending');

create function private.guard_support_ticket_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.reference,new.requester_context_id,new.requester_kind,new.requester_name,new.requester_email,new.guest_token_digest,new.request_key,new.type,new.category,new.subject,new.source,new.created_at)
  is distinct from (old.id,old.reference,old.requester_context_id,old.requester_kind,old.requester_name,old.requester_email,old.guest_token_digest,old.request_key,old.type,old.category,old.subject,old.source,old.created_at) then
  raise exception using errcode='42501',message='Support case identity and original report are immutable';end if;
 return new;
end;$$;
create trigger support_ticket_identity_guard before update on private.support_tickets for each row execute function private.guard_support_ticket_identity();

alter table private.support_invitations enable row level security;
alter table private.support_memberships enable row level security;
alter table private.support_tickets enable row level security;
alter table private.support_messages enable row level security;
alter table private.support_events enable row level security;
alter table private.support_email_outbox enable row level security;
revoke all on private.support_invitations,private.support_memberships,private.support_tickets,private.support_messages,private.support_events,private.support_email_outbox from public,anon,authenticated,pinevela_backend,pinevela_catalog;
-- Scoped application reads retain RLS. Every mutation is a narrowly authorized
-- server transaction; no browser or backend-role write grant is introduced.
grant select on private.support_memberships,private.support_tickets,private.support_messages to pinevela_backend;
revoke all on function private.support_issuer_valid(private.support_invitations),private.support_operator(),private.guard_support_membership(),private.guard_support_ticket_identity() from public,anon,authenticated;
grant execute on function private.support_operator() to pinevela_backend;
create policy support_own_membership on private.support_memberships for select to pinevela_backend using(context_id=private.current_context_id());
create policy support_ticket_read on private.support_tickets for select to pinevela_backend
 using(requester_context_id=private.current_context_id() or private.support_operator());
create policy support_message_read on private.support_messages for select to pinevela_backend
 using((not internal or private.support_operator()) and exists(select 1 from private.support_tickets t where t.id=ticket_id));
