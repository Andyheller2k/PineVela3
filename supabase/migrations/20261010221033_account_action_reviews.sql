-- Reviews only. No account policy, Auth revocation or deletion is enabled here.
create table private.account_review_state (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 0 check(revision>=0)
);
insert into private.account_review_state(singleton) values(true);
alter table private.account_review_state enable row level security;
revoke all on private.account_review_state from public,anon,authenticated,pinevela_backend;
-- Domain lifecycle triggers run as the existing non-BYPASSRLS backend role.
grant select,update(revision) on private.account_review_state to pinevela_backend;
create policy account_review_state_backend on private.account_review_state to pinevela_backend using(true) with check(true);
create function private.account_review_revision_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op<>'UPDATE' or pg_trigger_depth()<2 or new.singleton is distinct from old.singleton
    or new.revision is distinct from old.revision+1 then
    raise exception using errcode='42501',message='Review revisions are maintained by domain lifecycle triggers';
  end if;return new;
end;
$$;
create trigger account_review_revision_guard before insert or update or delete on private.account_review_state
  for each row execute function private.account_review_revision_guard();
create function private.account_review_lifecycle_changed() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and to_jsonb(new) is not distinct from to_jsonb(old) then return new;end if;
  update private.account_review_state set revision=revision+1 where singleton;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger account_review_context_changed after insert or delete or update of auth_user_id,primary_owner_id,kind,status on public.account_contexts
  for each row execute function private.account_review_lifecycle_changed();
create trigger account_review_parent_changed after update of primary_owner_id on public.profiles
  for each row when(old.primary_owner_id is distinct from new.primary_owner_id) execute function private.account_review_lifecycle_changed();
create trigger account_review_staff_changed after insert or delete or update of staff_context_id,residence_id,created_by_manager_id,status,ended_at on public.staff_assignments
  for each row execute function private.account_review_lifecycle_changed();
create trigger account_review_manager_changed after insert or delete or update on public.manager_assignments
  for each row execute function private.account_review_lifecycle_changed();
create trigger account_review_allocation_changed after insert or delete or update on public.allocations
  for each row execute function private.account_review_lifecycle_changed();

alter table public.admin_proposals add column account_roster_revision bigint,
  add column account_lifecycle_revision bigint,add column account_final_rejection_reason text,
  add column account_final_rejected_by uuid references public.admin_memberships(context_id),
  add column account_final_rejected_at timestamptz;
-- Historical JSON-era approvals never become authority in the new protocol.
update public.admin_proposals set account_roster_revision=0,account_lifecycle_revision=0,
  status=case when status in('pending','approved') then 'invalidated' else status end where kind='account_action';
alter table public.admin_proposals add constraint account_review_revisions_present check
  (kind<>'account_action' or account_roster_revision>=0 and account_roster_revision is not null
    and account_lifecycle_revision>=0 and account_lifecycle_revision is not null),
  add constraint account_review_final_rejection_complete check
  ((account_final_rejection_reason is null and account_final_rejected_by is null and account_final_rejected_at is null)
    or kind='account_action' and status='rejected' and account_final_rejection_reason is not null and length(btrim(account_final_rejection_reason)) between 3 and 500
      and account_final_rejected_by is not null and account_final_rejected_at is not null);

create function private.valid_account_review(action text,features jsonb,duration jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare amount numeric; multiplier numeric;
begin
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
create function private.account_review_preview(target uuid,action text,features jsonb,duration jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('version',1,'action',action,'features',features,'duration',duration,
    'target',jsonb_build_object('id',c.id,'kind',c.kind,'status',c.status,'authUserId',c.auth_user_id,
      'primaryOwnerId',coalesce(c.primary_owner_id,c.auth_user_id),'name',p.display_name),
    'roster',private.recovery_roster())
  from public.account_contexts c join public.profiles p on p.id=c.auth_user_id
  where c.id=target and c.kind<>'admin' and c.status<>'closed';
$$;
create function private.account_review_digest(preview jsonb,roster_revision bigint,lifecycle_revision bigint) returns text
language sql immutable set search_path='' as $$
  select md5(jsonb_build_object('preview',preview,'rosterRevision',roster_revision,'lifecycleRevision',lifecycle_revision)::text);
$$;
create function private.account_review_current(p public.admin_proposals) returns boolean
language sql stable set search_path='' as $$
  select coalesce(p.kind='account_action' and p.expires_at>clock_timestamp()
    and p.account_roster_revision=(select roster_revision from private.admin_pricing_state where singleton)
    and p.account_lifecycle_revision=(select revision from private.account_review_state where singleton)
    and p.preview=private.account_review_preview(p.target_context_id,p.preview->>'action',p.preview->'features',p.preview->'duration')
    and jsonb_array_length(p.preview->'roster')=5
    and p.baseline_digest=private.account_review_digest(p.preview,p.account_roster_revision,p.account_lifecycle_revision),false);
$$;
create function private.account_review_quorum(proposal uuid) returns boolean
language sql stable set search_path='' as $$
  select count(*)=5 and coalesce(bool_and(v.decision='approved' and exists(
    select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=v.administrator_context_id::text)),false)
  from public.admin_votes v join public.admin_proposals p on p.id=v.proposal_id where p.id=proposal;
$$;
create function private.account_review_proposal_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid; roster_revision bigint; lifecycle_revision bigint;
begin
  if tg_op='DELETE' then
    if old.kind='account_action' then raise exception using errcode='42501',message='Account review history is immutable';end if;return old;
  end if;
  if tg_op='UPDATE' and new.kind is distinct from old.kind and (new.kind='account_action' or old.kind='account_action') then
    raise exception using errcode='42501',message='Account review kind is immutable';end if;
  if new.kind<>'account_action' then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
  select s.roster_revision into roster_revision from private.admin_pricing_state s where singleton;
  select revision into lifecycle_revision from private.account_review_state where singleton for share;
  actor:=private.approval_authorized_context();
  if tg_op='INSERT' then
    if actor is null or actor is distinct from new.proposer_context_id or new.target_context_id is null
      or new.target_residence_id is not null or new.quorum<>5 or new.status<>'pending'
      or new.account_roster_revision is distinct from roster_revision or new.account_lifecycle_revision is distinct from lifecycle_revision
      or not coalesce(private.valid_account_review(new.preview->>'action',new.preview->'features',new.preview->'duration'),false)
      or new.preview is distinct from private.account_review_preview(new.target_context_id,new.preview->>'action',new.preview->'features',new.preview->'duration')
      or jsonb_array_length(new.preview->'roster')<>5
      or not exists(select 1 from jsonb_array_elements(new.preview->'roster') r where r->>'slot'='1')
      or new.baseline_digest is distinct from private.account_review_digest(new.preview,roster_revision,lifecycle_revision)
      or length(btrim(new.reason)) not between 3 and 500 or new.decided_at is not null
      or new.executed_at is not null or new.executed_by_context_id is not null
      or new.account_final_rejection_reason is not null or new.account_final_rejected_by is not null or new.account_final_rejected_at is not null then
      raise exception using errcode='42501',message='Five current keyed administrators and an exact account review are required';end if;
    if exists(select 1 from public.admin_proposals where kind='account_action' and target_context_id=new.target_context_id and status in('pending','approved')) then
      raise exception using errcode='23505',message='An account review is already open';end if;
    if (select count(*) from public.admin_proposals where kind='account_action' and status in('pending','approved'))>=10 then
      raise exception using errcode='54000',message='Too many open account reviews';end if;
    new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
  else
    if (new.id,new.proposer_context_id,new.target_context_id,new.target_residence_id,new.preview,new.baseline_digest,new.reason,new.quorum,new.created_at,new.expires_at,new.account_roster_revision,new.account_lifecycle_revision)
      is distinct from (old.id,old.proposer_context_id,old.target_context_id,old.target_residence_id,old.preview,old.baseline_digest,old.reason,old.quorum,old.created_at,old.expires_at,old.account_roster_revision,old.account_lifecycle_revision) then
      raise exception using errcode='42501',message='Reviewed account metadata is immutable';end if;
    if new.status is distinct from old.status then
      if old.status not in('pending','approved') then raise exception using errcode='42501',message='Account review is final';end if;
      if new.status='expired' and old.expires_at<=clock_timestamp() then null;
      elsif new.status='invalidated' and not private.account_review_current(old) then null;
      elsif new.status='approved' and old.status='pending' and actor is not null and private.account_review_current(old)
        and private.account_review_quorum(old.id) then null;
      elsif new.status='rejected' and actor is not null and private.account_review_current(old) then
        if old.status='pending' and exists(select 1 from public.admin_votes where proposal_id=old.id and administrator_context_id=actor and decision='rejected') then null;
        elsif old.status='approved' and private.account_review_quorum(old.id)
          and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
          and length(btrim(new.account_final_rejection_reason)) between 3 and 500 then
          new.account_final_rejected_by:=actor;new.account_final_rejected_at:=clock_timestamp();
        else raise exception using errcode='42501',message='An independent rejection or keyed founder final rejection is required';end if;
      else raise exception using errcode='42501',message='Account application is disabled; current review consent is required';end if;
      new.decided_at:=clock_timestamp();
    elsif new.decided_at is distinct from old.decided_at then
      raise exception using errcode='42501',message='Decision metadata is server controlled';
    end if;
    if (new.executed_at,new.executed_by_context_id) is distinct from (old.executed_at,old.executed_by_context_id)
      or (new.account_final_rejection_reason,new.account_final_rejected_by,new.account_final_rejected_at)
        is distinct from (old.account_final_rejection_reason,old.account_final_rejected_by,old.account_final_rejected_at)
        and not coalesce(old.status='approved' and new.status='rejected' and new.account_final_rejected_by=actor,false) then
      raise exception using errcode='42501',message='Final account decision metadata is immutable';end if;
  end if;return new;
end;
$$;
create trigger account_review_proposal_guard before insert or update or delete on public.admin_proposals
  for each row execute function private.account_review_proposal_guard();
create function private.account_review_vote_guard() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals;actor uuid;
begin
  if tg_op='UPDATE' and exists(select 1 from public.admin_proposals where id=old.proposal_id and kind='account_action') then
    raise exception using errcode='42501',message='Account review votes are immutable';end if;
  select * into p from public.admin_proposals where id=case when tg_op='DELETE' then old.proposal_id else new.proposal_id end for update;
  if p.kind is distinct from 'account_action' then return case when tg_op='DELETE' then old else new end;end if;
  if tg_op<>'INSERT' then raise exception using errcode='42501',message='Account review votes are immutable';end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
  perform revision from private.account_review_state where singleton for share;
  actor:=private.approval_authorized_context();
  if actor is null or actor is distinct from new.administrator_context_id or p.status<>'pending' or not private.account_review_current(p)
    or not exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=actor::text)
    or exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=actor)
    or (select count(*) from public.admin_votes where proposal_id=p.id)>=5
    or actor=p.proposer_context_id and new.decision<>'approved'
    or actor<>p.proposer_context_id and not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=p.proposer_context_id and decision='approved') then
    raise exception using errcode='42501',message='One current keyed vote per administrator is required';end if;
  new.decided_at:=clock_timestamp();return new;
end;
$$;
create trigger account_review_vote_guard before insert or update or delete on public.admin_votes
  for each row execute function private.account_review_vote_guard();
create function private.account_review_vote_recorded() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.admin_proposals where id=new.proposal_id and kind='account_action') then
    if new.decision='rejected' then update public.admin_proposals set status='rejected' where id=new.proposal_id;
    elsif private.account_review_quorum(new.proposal_id) then update public.admin_proposals set status='approved' where id=new.proposal_id;end if;
  end if;return new;
end;
$$;
create trigger account_review_vote_recorded after insert on public.admin_votes
  for each row execute function private.account_review_vote_recorded();
revoke all on function private.account_review_revision_guard(),private.account_review_lifecycle_changed(),
  private.valid_account_review(text,jsonb,jsonb),private.account_review_preview(uuid,text,jsonb,jsonb),
  private.account_review_digest(jsonb,bigint,bigint),private.account_review_current(public.admin_proposals),
  private.account_review_quorum(uuid),private.account_review_proposal_guard(),private.account_review_vote_guard(),
  private.account_review_vote_recorded() from public,anon,authenticated,pinevela_backend;
