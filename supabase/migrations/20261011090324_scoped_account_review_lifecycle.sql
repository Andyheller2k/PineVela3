-- Target-related lifecycle evidence. Approval alone still imposes no access policy.
create table private.account_review_events (
  revision bigint primary key check(revision>0),
  changed_context_ids uuid[] not null,
  branch_context_ids uuid[] not null
);
alter table private.account_review_events enable row level security;
revoke all on private.account_review_events from public,anon,authenticated,pinevela_backend;
grant select on private.account_review_events to pinevela_backend;
create policy account_review_events_backend_read on private.account_review_events for select to pinevela_backend using(true);
create function private.account_review_event_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op<>'INSERT' or pg_trigger_depth()<2
    or new.revision is distinct from (select revision from private.account_review_state where singleton) then
    raise exception using errcode='42501',message='Account lifecycle evidence is append-only and maintained by domain triggers';
  end if;return new;
end;
$$;
create trigger account_review_event_guard before insert or update or delete on private.account_review_events
  for each row execute function private.account_review_event_guard();
create or replace function private.account_review_lifecycle_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}'; after_row jsonb:='{}'; changed uuid[]:='{}'; branches uuid[]:='{}'; seq bigint; owners uuid[];
begin
  if tg_table_schema<>'public' or tg_table_name not in('account_contexts','profiles','staff_assignments','manager_assignments','allocations') then
    raise exception using errcode='42501',message='Unsupported account lifecycle source';end if;
  if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
  if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
  if tg_op='UPDATE' and after_row is not distinct from before_row then return new;end if;
  update private.account_review_state set revision=revision+1 where singleton returning revision into seq;
  if tg_table_name='account_contexts' then
    changed:=array[(before_row->>'id')::uuid,(after_row->>'id')::uuid];
    owners:=array[(before_row->>'primary_owner_id')::uuid,(after_row->>'primary_owner_id')::uuid];
    select coalesce(array_agg(id),'{}') into branches from public.account_contexts
      where kind='primary' and auth_user_id=any(owners);
  elsif tg_table_name='profiles' then
    select coalesce(array_agg(id),'{}') into changed from public.account_contexts
      where auth_user_id=(coalesce(after_row->>'id',before_row->>'id'))::uuid;
  elsif tg_table_name='staff_assignments' then
    changed:=array[(before_row->>'staff_context_id')::uuid,(after_row->>'staff_context_id')::uuid];
    branches:=array[(before_row->>'created_by_manager_id')::uuid,(after_row->>'created_by_manager_id')::uuid];
  elsif tg_table_name='manager_assignments' then
    changed:=array[(before_row->>'manager_context_id')::uuid,(after_row->>'manager_context_id')::uuid];
  elsif tg_table_name='allocations' then
    changed:=array[(before_row->>'resident_context_id')::uuid,(after_row->>'resident_context_id')::uuid];
  else raise exception using errcode='42501',message='Unsupported account lifecycle source';end if;
  insert into private.account_review_events(revision,changed_context_ids,branch_context_ids)
    values(seq,array_remove(changed,null),array_remove(branches,null));
  return case when tg_op='DELETE' then old else new end;
end;
$$;
-- The internal trigger records links across RLS boundaries; outer domain writes still
-- require their existing session/relationship authorization. It is not an RPC.
revoke update(revision) on private.account_review_state from pinevela_backend;
-- Parent relationships come from saved UUID links, never mailbox matching.
create function private.account_review_scope(target uuid) returns jsonb
language sql stable set search_path='' as $$
  with recursive edges as (
    select c.id,case when c.kind='primary' then null when c.kind='staff' then s.created_by_manager_id
      else root.id end as parent_id
    from public.account_contexts c
    left join public.staff_assignments s on s.staff_context_id=c.id and s.ended_at is null
    left join public.account_contexts root on root.kind='primary' and root.auth_user_id=coalesce(c.primary_owner_id,c.auth_user_id)
    where c.kind<>'admin'
  ), descendants(id) as (
    select id from edges where id=target
    union select e.id from edges e join descendants d on e.parent_id=d.id
  ), ancestors(id) as (
    select id from edges where id=target
    union select e.parent_id from edges e join ancestors a on e.id=a.id where e.parent_id is not null
  )
  select jsonb_build_object('version',1,
    'affected',coalesce((select jsonb_agg(id order by id) from descendants),'[]'::jsonb),
    'ancestors',coalesce((select jsonb_agg(id order by id) from ancestors),'[]'::jsonb));
$$;
create or replace function private.account_review_preview(target uuid,action text,features jsonb,duration jsonb) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('version',2,'action',action,'features',features,'duration',duration,
    'target',jsonb_build_object('id',c.id,'kind',c.kind,'status',c.status,'authUserId',c.auth_user_id,
      'primaryOwnerId',coalesce(c.primary_owner_id,c.auth_user_id),'name',p.display_name),
    'scope',private.account_review_scope(c.id),'roster',private.recovery_roster())
  from public.account_contexts c join public.profiles p on p.id=c.auth_user_id
  where c.id=target and c.kind<>'admin' and c.status<>'closed';
$$;
create or replace function private.account_review_current(p public.admin_proposals) returns boolean
language sql stable set search_path='' as $$
  select coalesce(p.kind='account_action' and p.expires_at>clock_timestamp()
    and p.account_roster_revision=(select roster_revision from private.admin_pricing_state where singleton)
    and p.account_lifecycle_revision<=(select revision from private.account_review_state where singleton)
    and p.preview=private.account_review_preview(p.target_context_id,p.preview->>'action',p.preview->'features',p.preview->'duration')
    and not exists(select 1 from private.account_review_events e where e.revision>p.account_lifecycle_revision and (
      e.changed_context_ids && array(select jsonb_array_elements_text(p.preview#>'{scope,affected}')::uuid
        union select jsonb_array_elements_text(p.preview#>'{scope,ancestors}')::uuid)
      or e.branch_context_ids && array(select jsonb_array_elements_text(p.preview#>'{scope,affected}')::uuid)))
    and jsonb_array_length(p.preview->'roster')=5
    and p.baseline_digest=private.account_review_digest(p.preview,p.account_roster_revision,p.account_lifecycle_revision),false);
$$;
revoke all on function private.account_review_event_guard(),private.account_review_scope(uuid),
  private.account_review_lifecycle_changed() from public,anon,authenticated,pinevela_backend;
-- A pre-upgrade review lacks scoped evidence and must collect fresh consent.
-- Leave closure to the existing transactional review status handler and its notices.

-- Preserve protected administrator governance; let non-admin deletions reach lifecycle triggers.
create or replace function private.guard_administrator_context() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.kind='admin' or exists(select 1 from public.admin_memberships where context_id=old.id) then
    if tg_op='DELETE' then raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
    if (new.id,new.auth_user_id,new.primary_owner_id,new.kind) is not distinct from (old.id,old.auth_user_id,old.primary_owner_id,old.kind)
      and old.status='active' and new.status='closed' and private.removal_founder() is not null
      and exists(select 1 from public.admin_proposals p join public.admin_memberships m on m.context_id=p.target_context_id
        where p.id::text=current_setting('pinevela.admin_removal_proposal_id',true) and p.target_context_id=old.id
          and p.kind='administrator_removal' and p.status in ('awaiting-plea','plea-rejected') and m.status='removed'
          and p.proposer_context_id=private.removal_founder() and private.removal_quorum(p.id)
          and current_setting('pinevela.admin_removal_confirmation',true)='REMOVE ADMINISTRATOR') then return new;end if;
    if (new.id,new.auth_user_id,new.primary_owner_id,new.kind,new.status) is distinct from
       (old.id,old.auth_user_id,old.primary_owner_id,old.kind,old.status) then
      raise exception using errcode='42501',message='Administrator ownership and access must use the governance protocol';end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
