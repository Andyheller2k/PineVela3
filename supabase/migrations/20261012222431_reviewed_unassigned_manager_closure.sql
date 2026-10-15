-- Own-key requests reuse five-member account review for portal-only closure.
-- Auth, housing/history, Storage objects and existing restrictions are retained.
create function private.unassigned_manager_closable(target uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.account_contexts c where c.id=target and c.kind='manager' and c.status='active'
   and exists(select 1 from private.manager_operation_keys k where k.manager_context_id=c.id and k.key_hash is not null)
   and not exists(select 1 from public.manager_assignments a where a.manager_context_id=c.id and a.ended_at is null)
   and not exists(select 1 from public.staff_assignments s where s.created_by_manager_id=c.id and s.status='active' and s.ended_at is null)
   and not exists(select 1 from public.verification_cases v join public.residences h on h.id=v.residence_id
     where v.applicant_context_id=c.id and h.status<>'closed'));
$$;
revoke all on function private.unassigned_manager_closable(uuid) from public,anon,authenticated,pinevela_backend;

create or replace function private.valid_account_review(action text,features jsonb,duration jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare amount numeric; multiplier numeric;
begin
  if action='close-manager' then return features='[]'::jsonb and duration='null'::jsonb;end if;
  if action is null or action not in('ban','restrict','restore') or jsonb_typeof(features) is distinct from 'array' then return false;end if;
  if action='restrict' then
    return duration='null'::jsonb and jsonb_array_length(features) between 1 and 6
      and not exists(select 1 from jsonb_array_elements(features) f where jsonb_typeof(f)<>'string'
        or f#>>'{}' not in('subaccounts','rooms','orders','publishing','messaging','maintenance'))
      and (select count(distinct f)=count(*) from jsonb_array_elements(features) f);
  end if;
  if features<>'[]'::jsonb then return false;end if;
  if action='restore' then return duration='null'::jsonb;end if;
  if jsonb_typeof(duration) is distinct from 'object' or not duration ?& array['amount','unit']
    or (select count(*) from jsonb_object_keys(duration))<>2 or jsonb_typeof(duration->'amount') is distinct from 'number' then return false;end if;
  amount:=(duration->>'amount')::numeric;
  multiplier:=case duration->>'unit' when 'hours' then 3600000 when 'days' then 86400000
    when 'weeks' then 604800000 when 'months' then 2592000000 when 'years' then 31536000000 else null end;
  return multiplier is not null and amount>=1 and amount=trunc(amount) and amount*multiplier<=3153600000000;
end;
$$;

create or replace function private.account_review_preview(target uuid,action text,features jsonb,duration jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('version',2,'action',action,'features',features,'duration',duration,
    'target',jsonb_build_object('id',c.id,'kind',c.kind,'status',c.status,'authUserId',c.auth_user_id,
      'primaryOwnerId',coalesce(c.primary_owner_id,c.auth_user_id),'name',p.display_name),
    'scope',private.account_review_scope(c.id),'roster',private.recovery_roster())
    || case when action='close-manager' then jsonb_build_object('closureRequest',
      (select jsonb_build_object('id',q.id,'reason',q.reason,'requestWaiver',q.request_waiver,'createdAt',q.created_at)
       from private.manager_closure_requests q where q.manager_context_id=c.id and q.state in('pending','reviewing')),
      'managerKeyVersion',(select k.version from private.manager_operation_keys k where k.manager_context_id=c.id and k.key_hash is not null),
      'retainedRestrictions',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.registration_bans b
       where b.account_context_id=c.id or b.account_context_id in(select id from public.account_contexts root
        where root.kind='primary' and root.auth_user_id=coalesce(c.primary_owner_id,c.auth_user_id))),'[]'::jsonb),
      'identityRetained',true,'historyRetained',true,'otherPortalsRetained',true) else '{}'::jsonb end
  from public.account_contexts c join public.profiles p on p.id=c.auth_user_id
  where c.id=target and c.kind<>'admin' and c.status<>'closed'
    and (action<>'close-manager' or (private.unassigned_manager_closable(c.id)
      and exists(select 1 from private.manager_closure_requests q where q.manager_context_id=c.id and q.state in('pending','reviewing'))));
$$;

create or replace function private.account_policy_executed() returns trigger
language plpgsql set search_path='' as $$
declare ms numeric;until_at timestamptz;old_policy private.account_policies;selected_features text[];
begin
 if new.preview->>'action'='close-manager' then return new;end if;
 if new.kind<>'account_action' or new.status<>'executed' or old.status='executed' then return new;end if;
 select * into old_policy from private.account_policies where context_id=new.target_context_id for update;
 selected_features:=case new.preview->>'action' when 'restore' then '{}'::text[]
   when 'restrict' then array(select jsonb_array_elements_text(new.preview->'features')) else coalesce(old_policy.features,'{}') end;
 until_at:=old_policy.ban_until;
 if new.preview->>'action'='restore' then until_at:=null;
 elsif new.preview->>'action'='ban' then
  ms:=(new.preview#>>'{duration,amount}')::numeric*case new.preview#>>'{duration,unit}'
    when 'hours' then 3600000 when 'days' then 86400000 when 'weeks' then 604800000
    when 'months' then 2592000000 when 'years' then 31536000000 end;
  until_at:=new.executed_at+ms*interval '1 millisecond';
 end if;
 insert into private.account_policies(context_id,revision,proposal_id,applied_by,applied_at,reason,features,ban_until)
  values(new.target_context_id,coalesce(old_policy.revision,0)+1,new.id,new.executed_by_context_id,new.executed_at,new.reason,selected_features,until_at)
  on conflict(context_id) do update set revision=excluded.revision,proposal_id=excluded.proposal_id,
   applied_by=excluded.applied_by,applied_at=excluded.applied_at,reason=excluded.reason,features=excluded.features,ban_until=excluded.ban_until;
 if new.preview->>'action' in('ban','restore') then
  insert into private.account_access_epochs(context_id,valid_after,proposal_id)
    select x::uuid,new.executed_at,new.id from jsonb_array_elements_text(new.preview#>'{scope,affected}') x
    on conflict(context_id) do update set valid_after=excluded.valid_after,proposal_id=excluded.proposal_id;
 end if;
 return new;
end;
$$;

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

create function private.manager_portal_closure_executed() returns trigger
language plpgsql set search_path='' as $$
declare request private.manager_closure_requests;actor uuid:=private.approval_authorized_context();
begin
 if new.kind<>'account_action' or new.preview->>'action'<>'close-manager'
   or new.status<>'executed' or old.status='executed' then return new;end if;
 select * into request from private.manager_closure_requests where id::text=new.preview#>>'{closureRequest,id}' for update;
 if request.id is null or request.manager_context_id is distinct from new.target_context_id
   or request.state<>'reviewing' or request.proposal_id is distinct from new.id
   or actor is distinct from new.executed_by_context_id or not private.account_review_quorum(new.id)
   or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
   or not private.unassigned_manager_closable(new.target_context_id)
   or current_setting('pinevela.account_action_confirmation',true)<>'APPLY ACCOUNT POLICY'
   or current_setting('pinevela.account_action_proposal_id',true)<>new.id::text then
  raise exception using errcode='42501',message='Current own request and five approvals with founder execution required';end if;
 -- Portal-only access closure; no child/housing/Auth/media/policy record is deleted.
 update public.account_contexts set status='closed',updated_at=clock_timestamp() where id=new.target_context_id;
 delete from private.account_sessions where active_context_id=new.target_context_id;
 insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
  values(actor,'unassigned_manager_portal_closed','account_context',new.target_context_id,
   jsonb_build_object('proposalId',new.id,'closureRequestId',request.id,'identityRetained',true,'historyRetained',true));
 return new;
end;
$$;
create trigger manager_portal_closure_executed after update on public.admin_proposals
 for each row execute function private.manager_portal_closure_executed();
revoke all on function private.manager_portal_closure_executed() from public,anon,authenticated,pinevela_backend;
