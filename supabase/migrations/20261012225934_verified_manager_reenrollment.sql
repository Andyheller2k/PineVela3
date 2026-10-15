-- Retain work identity and prior inspections; one open case per enrollment generation.
alter table private.account_enrollments add column manager_generation integer not null default 0 check(manager_generation>=0);
alter table public.verification_cases add column manager_generation integer not null default 0 check(manager_generation>=0);
drop index public.verification_cases_open_applicant_kind_idx;
create unique index verification_cases_open_applicant_kind_idx on public.verification_cases(applicant_context_id,kind,manager_generation)
 where status in('submitted','inspection_pending','under_review','more_info_required');

create function private.manager_reactivation_allowed(target uuid,enrollment uuid,proof_session uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.account_contexts c join public.profiles p on p.id=c.auth_user_id
  join private.account_enrollments e on e.linked_context_id=c.id join auth.users u on u.id=c.auth_user_id
  join auth.sessions s on s.user_id=u.id
  where private.current_kind()='primary' and c.id=target and c.kind='manager' and c.status='closed'
   and c.primary_owner_id=auth.uid() and p.primary_owner_id=auth.uid() and e.id=enrollment
   and e.initiator_context_id=private.current_context_id() and e.primary_owner_id=auth.uid()
   and e.kind='manager' and e.auth_user_id=u.id and e.verified_at is not null and e.status in('completed','cancelled','expired')
   and not u.is_anonymous and u.email_confirmed_at is not null and lower(u.email)=e.invited_email
   and s.id=proof_session and (s.not_after is null or s.not_after>clock_timestamp())
   and private.account_feature_allowed(c.id,'subaccounts')
   and not exists(select 1 from public.registration_bans b where b.until_at>clock_timestamp() and (
    (b.kind='residence' and b.account_context_id=c.id) or
    (b.kind='manager_account' and b.account_context_id in(select id from public.account_contexts root where root.kind='primary' and root.auth_user_id=c.primary_owner_id)) or
    (b.kind='residence' and b.account_context_id in(select id from public.account_contexts old_manager where old_manager.kind='manager' and old_manager.status='closed' and old_manager.primary_owner_id=c.primary_owner_id))))
   and not exists(select 1 from public.manager_assignments a where a.manager_context_id=c.id and a.ended_at is null)
   and not exists(select 1 from public.staff_assignments a where a.created_by_manager_id=c.id and a.status='active' and a.ended_at is null)
   and not exists(select 1 from public.verification_cases v join public.residences h on h.id=v.residence_id where v.applicant_context_id=c.id and h.status<>'closed')
   and not exists(select 1 from private.manager_closure_requests q join public.admin_proposals proposal on proposal.id=q.proposal_id
     where q.manager_context_id=c.id and q.state='reviewing' and (proposal.status in('pending','approved')
      or exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=proposal.id and f.state='frozen')))
   and not exists(select 1 from public.account_contexts other where other.primary_owner_id=c.primary_owner_id and other.kind='manager' and other.id<>c.id and other.status<>'closed')
   and not exists(select 1 from private.account_enrollments other where other.primary_owner_id=c.primary_owner_id and other.kind='manager' and other.id<>e.id and other.status in('pending_email','pending_review')));
$$;
create function private.current_manager_reactivation_allowed(target uuid) returns boolean
language plpgsql stable set search_path='' as $$
declare enrollment text:=current_setting('pinevela.manager_reactivation_enrollment_id',true);proof text:=current_setting('pinevela.manager_reactivation_proof_session',true);
begin
 if enrollment!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or proof!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then return false;end if;
 return coalesce(private.manager_reactivation_allowed(target,enrollment::uuid,proof::uuid),false);
end;
$$;
create function private.guard_manager_reactivation() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.kind='manager' and old.status='closed' and new.status<>'closed' then
  if new.status<>'pending' or (new.id,new.kind,new.auth_user_id,new.primary_owner_id) is distinct from (old.id,old.kind,old.auth_user_id,old.primary_owner_id)
   or not private.current_manager_reactivation_allowed(old.id) then raise exception using errcode='42501',message='Own verified work-identity proof and unassigned manager enrollment required';end if;
 end if;return new;
end;
$$;
create trigger manager_reactivation_guard before update on public.account_contexts for each row execute function private.guard_manager_reactivation();
create function private.guard_manager_registration_generation() returns trigger
language plpgsql set search_path='' as $$
declare generation integer;
begin
 if tg_op='UPDATE' then
  if new.manager_generation is distinct from old.manager_generation then raise exception using errcode='42501',message='Inspection generation is immutable';end if;
 elsif new.kind='manager_registration' then
  select e.manager_generation into generation from private.account_enrollments e join public.account_contexts c on c.id=e.linked_context_id
   where c.id=new.applicant_context_id and c.kind='manager' and c.status='pending' and e.kind='manager'
    and e.verified_at is not null and e.status='pending_review' and e.primary_owner_id=auth.uid()
    and e.initiator_context_id=private.current_context_id() and private.current_kind()='primary';
  if generation is null then raise exception using errcode='42501',message='Current verified manager enrollment required';end if;
  new.manager_generation:=generation;
 end if;return new;
end;
$$;
create trigger manager_registration_generation before insert or update on public.verification_cases for each row execute function private.guard_manager_registration_generation();
revoke all on function private.manager_reactivation_allowed(uuid,uuid,uuid),private.current_manager_reactivation_allowed(uuid),private.guard_manager_reactivation(),private.guard_manager_registration_generation() from public,anon,authenticated,pinevela_backend;

create or replace function private.guard_manager_closure_request() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid:=private.current_context_id();kind text:=private.current_kind();
begin
 if tg_op='DELETE' then raise exception using errcode='42501',message='Manager closure request history is retained';end if;
 if tg_op='INSERT' then
  if kind is distinct from 'manager' or actor is distinct from new.manager_context_id or new.state<>'pending'
   or not exists(select 1 from private.manager_operation_keys k where k.manager_context_id=actor
     and k.key_hash is not null and k.version::text=current_setting('pinevela.manager_closure_key_version',true)
     and (k.locked_until is null or k.locked_until<=clock_timestamp())) then
   raise exception using errcode='42501',message='Only a native manager with its own current key may request closure';
  end if;
  return new;
 end if;
 if kind='primary' and private.current_manager_reactivation_allowed(old.manager_context_id) then
  if old.state='pending' and new.state='withdrawn' and new.decided_at is not null
   and to_jsonb(new)-'state'-'decided_at'=to_jsonb(old)-'state'-'decided_at' then return new;end if;
  if old.state='reviewing' and new.state='resolved' and to_jsonb(new)-'state'=to_jsonb(old)-'state'
   and exists(select 1 from public.admin_proposals p where p.id=old.proposal_id and p.status in('executed','rejected','expired','invalidated')
    and (p.kind='account_action' and p.preview->>'action'='close-manager' and p.target_context_id=old.manager_context_id
      or p.kind='residence_deletion' and (p.status<>'executed' or exists(select 1 from private.residence_executions e where e.proposal_id=p.id and e.state='completed')))
    and not exists(select 1 from private.residence_deletion_preparations f where f.proposal_id=p.id and f.state='frozen')) then return new;end if;
 end if;
 if old.state='reviewing' and new.state='resolved' and kind='manager' and actor=old.manager_context_id
  and to_jsonb(new)-'state'=to_jsonb(old)-'state'
  and exists(select 1 from public.admin_proposals p where p.id=old.proposal_id and (p.kind='residence_deletion' or p.kind='account_action' and p.preview->>'action'='close-manager')
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
   and p.kind='account_action' and p.status='pending' and p.proposer_context_id=actor
   and p.preview->>'action'='close-manager' and p.target_context_id=old.manager_context_id
   and p.preview#>>'{closureRequest,id}'=old.id::text and private.unassigned_manager_closable(old.manager_context_id)) then return new;end if;
 if new.state='reviewing' and exists(select 1 from public.admin_proposals p where p.id=new.proposal_id
   and p.kind='residence_deletion' and p.status='pending' and p.proposer_context_id=actor
   and p.preview#>'{options,deleteManager}'='true'::jsonb
   and exists(select 1 from jsonb_array_elements(p.preview->'accounts') a
     where a->>'id'=old.manager_context_id::text and a->>'role'='manager' and a->>'effect'='close-portal')) then return new;end if;
 raise exception using errcode='42501',message='Closure must use its exact independently reviewed account or residence proposal';
end;
$$;
