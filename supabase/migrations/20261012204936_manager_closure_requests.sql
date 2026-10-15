-- An own-manager request is retained history, never deletion consent or execution.
create table private.manager_closure_requests (
 id uuid primary key default gen_random_uuid(),
 manager_context_id uuid not null references public.account_contexts(id),
 reason text not null check(length(trim(reason)) between 3 and 1000 and reason !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]'),
 request_waiver boolean not null,
 state text not null default 'pending' check(state in('pending','withdrawn','rejected','reviewing','resolved')),
 proposal_id uuid references public.admin_proposals(id),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by_context_id uuid references public.account_contexts(id),
 decision_reason text,
 check((state='pending' and proposal_id is null and decided_at is null and decided_by_context_id is null and decision_reason is null)
  or (state='withdrawn' and proposal_id is null and decided_at is not null and decided_by_context_id is null and decision_reason is null)
  or (state='rejected' and proposal_id is null and decided_at is not null and decided_by_context_id is not null
   and decision_reason is not null and length(trim(decision_reason)) between 3 and 1000)
  or (state in('reviewing','resolved') and proposal_id is not null and decided_at is not null and decided_by_context_id is not null and decision_reason is null))
);
create unique index manager_closure_requests_open on private.manager_closure_requests(manager_context_id) where state in('pending','reviewing');
create unique index manager_closure_requests_proposal on private.manager_closure_requests(proposal_id) where proposal_id is not null;
alter table private.manager_closure_requests enable row level security;
revoke all on private.manager_closure_requests from public,anon,authenticated,pinevela_backend;

create function private.guard_manager_closure_request() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid:=private.current_context_id();kind text:=private.current_kind();
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='Manager closure request history is retained';end if;
 if tg_op='INSERT' then
  if kind is distinct from 'manager' or actor is distinct from new.manager_context_id or new.state<>'pending'
   or not exists(select 1 from public.manager_assignments a join public.residences h on h.id=a.residence_id
     where a.manager_context_id=actor and a.ended_at is null and h.status<>'closed') then
   raise exception using errcode='42501',message='Only an assigned native manager may request own closure';
  end if;
  return new;
 end if;
 if old.state='reviewing' and new.state='resolved' and kind='manager' and actor=old.manager_context_id
  and to_jsonb(new)-'state'=to_jsonb(old)-'state'
  and exists(select 1 from public.admin_proposals p where p.id=old.proposal_id and p.kind='residence_deletion'
   and p.status in('rejected','expired','invalidated')
   and not exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=p.id and f.state='frozen')) then return new;end if;
 if (new.id,new.manager_context_id,new.reason,new.request_waiver,new.created_at)
  is distinct from (old.id,old.manager_context_id,old.reason,old.request_waiver,old.created_at) or old.state<>'pending' then
  raise exception using errcode='42501',message='Saved manager closure requests are immutable';
 end if;
 if kind='manager' and actor=old.manager_context_id and new.state='withdrawn' then return new;end if;
 if kind is distinct from 'admin' or new.decided_by_context_id is distinct from actor
  or not exists(select 1 from public.admin_memberships m join private.admin_secrets s on s.context_id=m.context_id
    where m.context_id=actor and m.status='active' and s.approval_key_hash is not null
      and s.approval_key_version::text=current_setting('pinevela.approval_key_version',true)
      and (s.locked_until is null or s.locked_until<=clock_timestamp())) then
  raise exception using errcode='42501',message='A current administrator own-key grant is required';
 end if;
 if new.state='rejected' then return new;end if;
 if new.state='reviewing' and exists(select 1 from public.admin_proposals p where p.id=new.proposal_id
   and p.kind='residence_deletion' and p.status='pending' and p.proposer_context_id=actor
   and p.preview#>'{options,deleteManager}'='true'::jsonb
   and exists(select 1 from jsonb_array_elements(p.preview->'accounts') a
     where a->>'id'=old.manager_context_id::text and a->>'role'='manager' and a->>'effect'='close-portal')) then return new;end if;
 raise exception using errcode='42501',message='Closure must use its exact independently reviewed residence proposal';
end;
$$;
create trigger manager_closure_request_guard before insert or update or delete on private.manager_closure_requests
 for each row execute function private.guard_manager_closure_request();
create function private.prevent_manager_closure_truncate() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='42501',message='Manager closure request history is retained';end;
$$;
create trigger manager_closure_request_truncate before truncate on private.manager_closure_requests
 for each statement execute function private.prevent_manager_closure_truncate();
revoke all on function private.guard_manager_closure_request(),private.prevent_manager_closure_truncate() from public,anon,authenticated,pinevela_backend;
