-- Account access policy execution. No identity is imported and no existing policy is applied.
create table private.account_policies (
 context_id uuid primary key references public.account_contexts(id),
 revision bigint not null check(revision>0),
 proposal_id uuid not null references public.admin_proposals(id),
 applied_by uuid not null references public.account_contexts(id),
 applied_at timestamptz not null,
 reason text not null check(length(btrim(reason)) between 3 and 500),
 features text[] not null default '{}'
   check(features <@ array['subaccounts','rooms','orders','publishing','messaging','maintenance']::text[]),
 ban_until timestamptz
);
create table private.account_access_epochs (
 context_id uuid primary key references public.account_contexts(id) on delete cascade,
 valid_after timestamptz not null,
 proposal_id uuid not null references public.admin_proposals(id)
);
create index account_policies_proposal_idx on private.account_policies(proposal_id);
create index account_policies_author_idx on private.account_policies(applied_by);
create index account_access_epochs_proposal_idx on private.account_access_epochs(proposal_id);
alter table private.account_policies enable row level security;
alter table private.account_access_epochs enable row level security;
revoke all on private.account_policies,private.account_access_epochs from public,anon,authenticated,pinevela_backend;

-- No email matching and no administrator inheritance. These internal lookups are not RPCs.
create function private.account_lineage(target uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 with recursive ancestors(id) as (
  select id from public.account_contexts where id=target and kind<>'admin'
  union
  select parent.id from ancestors a join public.account_contexts c on c.id=a.id
   left join public.staff_assignments employment on c.kind='staff' and employment.staff_context_id=c.id and employment.ended_at is null
   join public.account_contexts parent on parent.id=case when c.kind='staff' then employment.created_by_manager_id
     else (select root.id from public.account_contexts root where root.kind='primary'
       and root.auth_user_id=coalesce(c.primary_owner_id,c.auth_user_id)) end
   where c.kind<>'primary' and parent.kind<>'admin'
 ) select coalesce(array_agg(id),'{}'::uuid[]) from ancestors;
$$;
create function private.account_access(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with applicable as (
  select p.*,p.context_id<>target as inherited from private.account_policies p
  where p.context_id=any(private.account_lineage(target))
 ), banned as(select * from applicable where ban_until>clock_timestamp() order by ban_until desc limit 1)
 select jsonb_build_object('banned',exists(select 1 from banned),
  'reason',(select reason from banned),'until',(select ban_until from banned),
  'remainingSeconds',coalesce((select ceil(extract(epoch from ban_until-clock_timestamp()))::bigint from banned),0),
  'restrictions',coalesce((select jsonb_agg(jsonb_build_object('features',features,'reason',reason,
   'inherited',inherited,'appliedAt',applied_at) order by context_id) from applicable where cardinality(features)>0),'[]'::jsonb));
$$;
create function private.account_feature_allowed(target uuid,feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select target is not null and feature in('subaccounts','rooms','orders','publishing','messaging','maintenance')
  and not exists(select 1 from private.account_policies p where p.context_id=any(private.account_lineage(target))
    and (p.ban_until>clock_timestamp() or feature=any(p.features)));
$$;
create function private.account_session_allowed(target uuid,session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_contexts c join auth.sessions s on s.user_id=c.auth_user_id
  join auth.users u on u.id=c.auth_user_id where c.id=target and s.id=session
   and c.status='active' and u.email_confirmed_at is not null and not u.is_anonymous
   and (s.not_after is null or s.not_after>clock_timestamp())
   and not exists(select 1 from private.account_policies p where p.context_id=any(private.account_lineage(target))
      and p.ban_until>clock_timestamp())
   and not exists(select 1 from private.account_access_epochs e where e.context_id=any(private.account_lineage(target))
      and s.created_at<=e.valid_after));
$$;
revoke all on function private.account_lineage(uuid),private.account_access(uuid),
 private.account_feature_allowed(uuid,text),private.account_session_allowed(uuid,uuid) from public,anon,authenticated,pinevela_backend;
grant execute on function private.account_feature_allowed(uuid,text) to pinevela_backend;

create function private.current_account_feature_allowed(feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and private.account_feature_allowed(private.current_context_id(),feature);
$$;
revoke all on function private.current_account_feature_allowed(text) from public,anon,authenticated,pinevela_backend;
grant execute on function private.current_account_feature_allowed(text) to authenticated;

create function private.guard_account_policy() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals;previous private.account_policies;expected_features text[];expected_ban timestamptz;ms numeric;
begin
 if tg_op='DELETE' or pg_trigger_depth()<2 then raise exception using errcode='42501',message='Account policies require reviewed founder execution';end if;
 select * into previous from private.account_policies where context_id=new.context_id;
 select * into p from public.admin_proposals where id::text=current_setting('pinevela.account_action_proposal_id',true)
   and kind='account_action' and status='executed' and executed_by_context_id=private.approval_authorized_context();
 if p.id is null or new.context_id is distinct from p.target_context_id
   or new.proposal_id is distinct from p.id or new.applied_at is distinct from p.executed_at
   or new.applied_by is distinct from p.executed_by_context_id or new.reason is distinct from p.reason
   or new.revision is distinct from (coalesce(previous.revision,0)+1)
   or (tg_op='UPDATE' and new.context_id is distinct from old.context_id) then
   raise exception using errcode='42501',message='Exact executed account policy required';end if;
 expected_features:=case p.preview->>'action' when 'restore' then '{}'::text[]
   when 'restrict' then array(select jsonb_array_elements_text(p.preview->'features')) else coalesce(previous.features,'{}') end;
 expected_ban:=previous.ban_until;
 if p.preview->>'action'='restore' then expected_ban:=null;
 elsif p.preview->>'action'='ban' then
  ms:=(p.preview#>>'{duration,amount}')::numeric*case p.preview#>>'{duration,unit}'
    when 'hours' then 3600000 when 'days' then 86400000 when 'weeks' then 604800000
    when 'months' then 2592000000 when 'years' then 31536000000 end;
  expected_ban:=p.executed_at+ms*interval '1 millisecond';
 end if;
 if new.features is distinct from expected_features or new.ban_until is distinct from expected_ban then
   raise exception using errcode='42501',message='Policy must preserve reviewed features and duration';end if;
 return new;
end;
$$;
create trigger guard_account_policy before insert or update or delete on private.account_policies
 for each row execute function private.guard_account_policy();
create function private.guard_account_epoch() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals;
begin
 if tg_op='DELETE' or pg_trigger_depth()<2 then raise exception using errcode='42501',message='Session epochs require reviewed execution';end if;
 select * into p from public.admin_proposals where id::text=current_setting('pinevela.account_action_proposal_id',true)
   and kind='account_action' and status='executed' and executed_by_context_id=private.approval_authorized_context();
 if p.id is null or p.preview->>'action' not in('ban','restore')
   or not (p.preview#>'{scope,affected}') @> jsonb_build_array(new.context_id)
   or new.valid_after is distinct from p.executed_at or new.proposal_id is distinct from p.id
   or (tg_op='UPDATE' and (new.context_id is distinct from old.context_id or new.valid_after<old.valid_after)) then
   raise exception using errcode='42501',message='Exact affected portal session epoch required';end if;
 return new;
end;
$$;
create trigger guard_account_epoch before insert or update or delete on private.account_access_epochs
 for each row execute function private.guard_account_epoch();
create function private.account_policy_executed() returns trigger
language plpgsql set search_path='' as $$
declare ms numeric;until_at timestamptz;old_policy private.account_policies;selected_features text[];
begin
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
create trigger account_policy_executed after update on public.admin_proposals
 for each row execute function private.account_policy_executed();
revoke all on function private.guard_account_policy(),private.guard_account_epoch(),private.account_policy_executed()
 from public,anon,authenticated,pinevela_backend;
create or replace function private.account_review_proposal_guard() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid; roster_revision bigint; lifecycle_revision bigint;executing boolean:=false;
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
      elsif new.status='executed' and old.status='approved' and actor is not null
        and private.account_review_current(old) and private.account_review_quorum(old.id)
        and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
        and current_setting('pinevela.account_action_confirmation',true)='APPLY ACCOUNT POLICY'
        and current_setting('pinevela.account_action_proposal_id',true)=old.id::text then
        perform pg_advisory_xact_lock(hashtextextended('account-policies',0));
        new.executed_by_context_id:=actor;new.executed_at:=clock_timestamp();executing:=true;
      elsif new.status='rejected' and actor is not null and private.account_review_current(old) then
        if old.status='pending' and exists(select 1 from public.admin_votes where proposal_id=old.id and administrator_context_id=actor and decision='rejected') then null;
        elsif old.status='approved' and private.account_review_quorum(old.id)
          and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
          and length(btrim(new.account_final_rejection_reason)) between 3 and 500 then
          new.account_final_rejected_by:=actor;new.account_final_rejected_at:=clock_timestamp();
        else raise exception using errcode='42501',message='An independent rejection or keyed founder final rejection is required';end if;
      else raise exception using errcode='42501',message='Current review consent and founder confirmation are required';end if;
      new.decided_at:=clock_timestamp();
    elsif new.decided_at is distinct from old.decided_at then
      raise exception using errcode='42501',message='Decision metadata is server controlled';
    end if;
    if ((new.executed_at,new.executed_by_context_id) is distinct from (old.executed_at,old.executed_by_context_id) and not executing)
      or (new.account_final_rejection_reason,new.account_final_rejected_by,new.account_final_rejected_at)
        is distinct from (old.account_final_rejection_reason,old.account_final_rejected_by,old.account_final_rejected_at)
        and not coalesce(old.status='approved' and new.status='rejected' and new.account_final_rejected_by=actor,false) then
      raise exception using errcode='42501',message='Final account decision metadata is immutable';end if;
  end if;return new;
end;
$$;
create or replace function private.current_context_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.active_context_id from private.account_sessions s
  join public.account_contexts c on c.id = s.active_context_id
  join auth.sessions live on live.id = s.session_id and live.user_id = s.auth_user_id
  where s.auth_user_id = (select auth.uid()) and c.auth_user_id = s.auth_user_id and c.status = 'active'
    and (live.not_after is null or live.not_after > now())
    and private.portal_session_allowed(c.id,s.portal_pin_version)
    and private.account_session_allowed(c.id,s.session_id)
    and (c.kind <> 'admin' or exists (select 1 from public.admin_memberships m where m.context_id = c.id and m.status = 'active'))
    and (c.kind <> 'staff' or exists (select 1 from public.staff_assignments a where a.staff_context_id = c.id and a.status = 'active' and a.ended_at is null))
    and (c.kind <> 'resident' or exists (select 1 from public.allocations a where a.resident_context_id = c.id and a.ended_at is null))
    and s.session_id = case when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
      then (select auth.jwt()->>'session_id')::uuid else null end
  limit 1;
$$;
create or replace function private.store_is_public(store uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.stores s join public.account_contexts c on c.id=s.seller_context_id join public.seller_applications a on a.seller_context_id=c.id
    where s.id=store and s.status='active' and s.setup_completed_at is not null and s.activated_at is not null and c.kind='seller' and c.status='active' and a.status='approved' and not (private.account_access(c.id)->>'banned')::boolean
      and exists(select 1 from public.payments p where p.store_id=s.id and p.purpose='store_activation' and private.payment_grants_access(p.id))
      and exists(select 1 from public.store_subscriptions sub where sub.store_id=s.id and sub.status='active' and sub.starts_at<=now() and sub.ends_at>now() and private.payment_grants_access(sub.payment_id))
      and exists(select 1 from public.store_fee_periods f where f.store_id=s.id and f.starts_at<=now() and f.ends_at>now() and private.payment_grants_access(f.payment_id)));
$$;
create or replace function private.account_review_lifecycle_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}'; after_row jsonb:='{}'; changed uuid[]:='{}'; branches uuid[]:='{}'; seq bigint; owners uuid[];
begin
  if not ((tg_table_schema='public' and tg_table_name in('account_contexts','profiles','staff_assignments','manager_assignments','allocations'))
    or (tg_table_schema='private' and tg_table_name='account_policies')) then
    raise exception using errcode='42501',message='Unsupported account lifecycle source';end if;
  if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
  if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
  if tg_op='UPDATE' and after_row is not distinct from before_row then return new;end if;
  update private.account_review_state set revision=revision+1 where singleton returning revision into seq;
  if tg_table_name='account_policies' then
    changed:=array[(before_row->>'context_id')::uuid,(after_row->>'context_id')::uuid];
  elsif tg_table_name='account_contexts' then
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
create trigger account_review_policy_changed after insert or update on private.account_policies for each row execute function private.account_review_lifecycle_changed();

do $$ declare relation text;begin
 for relation in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy account_session_boundary on public.%I as restrictive for all to authenticated using (private.current_context_id() is not null) with check (private.current_context_id() is not null)',relation);
 end loop;
end;$$;
create policy account_session_boundary on storage.objects as restrictive for all to authenticated
 using(private.current_context_id() is not null) with check(private.current_context_id() is not null);
create policy account_messaging_boundary on public.market_messages as restrictive for all to authenticated
 using(private.current_account_feature_allowed('messaging')) with check(private.current_account_feature_allowed('messaging'));
-- These guards add denials; existing ownership, relationship, payment and evidence guards still run.
create function private.enforce_account_feature_write() returns trigger
language plpgsql set search_path='' as $$
declare row_data jsonb;context uuid;owner uuid;feature text;secondary text;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_schema='private' and tg_table_name='account_enrollments' then
  if tg_op<>'INSERT' and row_data->>'status' not in('pending_review','completed') then return new;end if;
  context:=(row_data->>'initiator_context_id')::uuid;feature:='subaccounts';
  if row_data->>'kind'='resident' then secondary:='rooms';end if;
 elsif tg_table_name='account_contexts' then
  if tg_op<>'INSERT' or row_data->>'kind' not in('resident','manager','seller') then return new;end if;
  select id into context from public.account_contexts where kind='primary' and auth_user_id=(row_data->>'primary_owner_id')::uuid;
  feature:='subaccounts';if row_data->>'kind'='resident' then secondary:='rooms';end if;
 elsif tg_table_name='staff_assignments' then
  context:=(row_data->>'created_by_manager_id')::uuid;feature:='subaccounts';
 elsif tg_table_name='allocations' then
  select root.id into context from public.account_contexts resident join public.account_contexts root
   on root.kind='primary' and root.auth_user_id=coalesce(resident.primary_owner_id,resident.auth_user_id)
   where resident.id=(row_data->>'resident_context_id')::uuid;
  feature:='rooms';
 elsif tg_table_name='market_orders' then
  context:=(row_data->>'buyer_context_id')::uuid;feature:='orders';
  select seller_context_id into owner from public.stores where id=(row_data->>'store_id')::uuid;
  if (private.account_access(owner)->>'banned')::boolean then raise exception using errcode='42501',message='Seller account is unavailable';end if;
 elsif tg_table_name='market_messages' then
  context:=(row_data->>'sender_context_id')::uuid;feature:='messaging';
  select seller_context_id into owner from public.stores where id=(row_data->>'store_id')::uuid;
  if (private.account_access(owner)->>'banned')::boolean or (private.account_access((row_data->>'buyer_context_id')::uuid)->>'banned')::boolean then
   raise exception using errcode='42501',message='Conversation account is unavailable';end if;
 elsif tg_table_name='listings' then
  -- Fulfillment consumes stock through the existing private order trigger. A
  -- publishing restriction must not prevent a verified existing handover.
  if tg_op='UPDATE' and pg_trigger_depth()>1
    and (to_jsonb(new)-array['stock_quantity','is_published'])=(to_jsonb(old)-array['stock_quantity','is_published'])
    and exists(select 1 from public.market_orders o join public.stores s on s.id=o.store_id
      where o.id::text=current_setting('pinevela.completed_order_stock',true)
        and o.listing_id=new.id and o.store_id=new.store_id and o.status='completed'
        and o.handover_verified_at is not null and new.stock_quantity=old.stock_quantity-o.quantity
        and new.is_published=(old.is_published and new.stock_quantity>0)
        and not (private.account_access(s.seller_context_id)->>'banned')::boolean) then return new;end if;
  select seller_context_id into context from public.stores where id=(row_data->>'store_id')::uuid;
  feature:='publishing';
 elsif tg_table_name='media_assets' then
  context:=(row_data->>'owner_context_id')::uuid;
  feature:=case row_data->>'purpose' when 'market' then 'publishing' when 'maintenance' then 'maintenance' else null end;
  if feature is null then return new;end if;
 elsif tg_table_name='maintenance_issues' then
  context:=(row_data->>'reporter_context_id')::uuid;feature:='maintenance';
 else raise exception using errcode='42501',message='Unsupported feature source';end if;
 if not private.account_feature_allowed(context,feature) or (secondary is not null and not private.account_feature_allowed(context,secondary)) then
  raise exception using errcode='42501',message='This account feature is restricted';end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.enforce_account_feature_write() from public,anon,authenticated,pinevela_backend;
create trigger account_feature_boundary before insert on public.account_contexts for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert on public.staff_assignments for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert on public.allocations for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert on public.market_orders for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert on public.market_messages for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert or update or delete on public.listings for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert on public.media_assets for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert on public.maintenance_issues for each row execute function private.enforce_account_feature_write();
create trigger account_feature_boundary before insert or update of status on private.account_enrollments for each row execute function private.enforce_account_feature_write();
create function private.current_account_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when (select auth.uid()) is not null and private.current_context_id() is not null
  then private.account_access(private.current_context_id()) else null end;
$$;
revoke all on function private.current_account_access() from public,anon,authenticated,pinevela_backend;
grant execute on function private.current_account_access() to authenticated;

create or replace function private.consume_market_order_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare previous text:=current_setting('pinevela.completed_order_stock',true);
begin
  if new.status='completed' and old.status<>'completed' then
    perform set_config('pinevela.completed_order_stock',new.id::text,true);
    update public.listings set stock_quantity=stock_quantity-new.quantity,is_published=is_published and stock_quantity-new.quantity>0
      where id=new.listing_id and kind='product' and retired_at is null and stock_quantity>=new.quantity;
    if not found and exists(select 1 from public.listings where id=new.listing_id and kind='product') then raise exception 'Handover stock is unavailable' using errcode='23514'; end if;
    perform set_config('pinevela.completed_order_stock',coalesce(previous,''),true);
  end if;return null;
end;$$;
