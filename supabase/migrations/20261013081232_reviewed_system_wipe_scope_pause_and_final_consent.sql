-- Scoped write pauses and short-lived final consent only; no wipe execution.
create table private.system_wipe_freezes(
 preparation_id uuid primary key references private.system_wipe_preparations(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 scope_digest text not null check(scope_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'frozen' check(state in('frozen','cancelled')),
 created_at timestamptz not null default clock_timestamp(),cancelled_at timestamptz,
 check((state='cancelled')=(cancelled_at is not null))
);
alter table private.system_wipe_freezes enable row level security;
revoke all on private.system_wipe_freezes from public,anon,authenticated,pinevela_backend;
create function private.system_wipe_pause_ready(p public.admin_proposals)returns boolean
 language sql stable set search_path='' as $$
 select coalesce((p.preview#>>'{obligations,openOrders}')::bigint=0
  and (p.preview#>>'{obligations,unsettledPayments}')::bigint=0
  and (p.preview#>>'{obligations,pausedResidenceReviews}')::bigint=0
  and not exists(select 1 from public.media_assets m where m.state in('reserved','removing') and (
   p.preview#>'{resources,media_assets}' ? m.id::text
   or p.preview#>'{resources,account_contexts}' ? m.owner_context_id::text
   or p.preview#>'{resources,residences}' ? m.residence_id::text))
  and not exists(select 1 from private.account_enrollments e where e.status='pending_email' and e.expires_at>clock_timestamp() and(
   p.preview#>'{resources,account_contexts}' ? e.initiator_context_id::text or p.preview#>'{resources,account_contexts}' ? e.linked_context_id::text
   or p.preview#>'{resources,residences}' ? e.residence_id::text or p.preview#>'{resources,rooms}' ? e.room_id::text)),false);
$$;
create function private.system_wipe_freeze_guard()returns trigger language plpgsql set search_path='' as $$
declare actor uuid;f private.system_wipe_preparations;p public.admin_proposals;
begin
 if tg_op in('DELETE','TRUNCATE')then raise exception using errcode='42501',message='Wipe pause history is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception using errcode='42501',message='Wipe pauses require READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 select * into f from private.system_wipe_preparations where id=new.preparation_id for update;
 select * into p from public.admin_proposals where id=f.proposal_id for update;
 if actor is null or actor is distinct from f.founder_context_id
  or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')then
  raise exception using errcode='42501',message='Current own-key founder required';end if;
 if tg_op='INSERT'then
  if f.state is distinct from 'active' or p.status is distinct from 'approved'
   or not private.system_wipe_current(p) or not private.system_wipe_quorum(p.id)
   or p.wipe_final_decision is distinct from 'approve-backup' or p.wipe_founder_context_id is distinct from actor
   or new.founder_context_id is distinct from actor or new.scope_digest is distinct from f.scope_digest
   or new.state is distinct from 'frozen' or new.cancelled_at is not null
   or current_setting('pinevela.system_wipe_pause_confirmation',true)is distinct from 'PAUSE REVIEWED WIPE'
   or not private.system_wipe_pause_ready(p)
   or exists(select 1 from private.system_wipe_recovery_evidence where preparation_id=f.id)
   or exists(select 1 from private.system_wipe_freezes where state='frozen')then
   raise exception using errcode='42501',message='Fresh five-admin founder review without unsettled work or earlier backup evidence required';end if;
  new.created_at:=clock_timestamp();
 else
  if old.state<>'frozen' or new.state is distinct from 'cancelled' or f.state is distinct from 'cancelled'
   or to_jsonb(new)-array['state','cancelled_at']is distinct from to_jsonb(old)-array['state','cancelled_at']then
   raise exception using errcode='42501',message='Only founder preparation cancellation can release a wipe pause';end if;
  new.cancelled_at:=clock_timestamp();
 end if;return new;
end;
$$;
create trigger system_wipe_freeze_guard before insert or update or delete on private.system_wipe_freezes for each row execute function private.system_wipe_freeze_guard();
create trigger system_wipe_freeze_truncate_guard before truncate on private.system_wipe_freezes for each statement execute function private.system_wipe_freeze_guard();
create function private.system_wipe_pause_cancelled()returns trigger language plpgsql set search_path='' as $$
begin
 if old.state='active'and new.state='cancelled'then update private.system_wipe_freezes set state='cancelled'where preparation_id=new.id and state='frozen';end if;
 return new;
end;
$$;
create trigger system_wipe_pause_cancelled after update on private.system_wipe_preparations for each row execute function private.system_wipe_pause_cancelled();

-- Called only by the existing private metadata trigger. It grants no access to
-- outer rows, performs no writes, and never identifies an owner by an email.
create function private.system_wipe_row_paused(schema_name text,table_name text,before_row jsonb,after_row jsonb)returns boolean
 language plpgsql set search_path='' as $$
declare item record;scope jsonb;roots jsonb;field record;ids jsonb;row_value jsonb;
begin
 for item in select p.preview from private.system_wipe_freezes f join private.system_wipe_preparations prep on prep.id=f.preparation_id
  join public.admin_proposals p on p.id=prep.proposal_id where f.state='frozen'loop
  scope:=item.preview->'resources';roots:=jsonb_path_query_array(item.preview,'$.accounts[*] ? (@.kind == "primary").authUserId');
  if schema_name='storage'then
   for row_value in select before_row union select after_row loop
    if table_name='objects'and(coalesce(scope->'account_contexts' ? split_part(row_value->>'name','/',2),false)
     and split_part(row_value->>'name','/',1)='contexts'
     or exists(select 1 from public.media_assets m where m.bucket_id=row_value->>'bucket_id'and m.object_path=row_value->>'name'and scope->'media_assets' ? m.id::text))then return true;end if;
   end loop;
   continue;
  end if;
  for field in select key,value from jsonb_each_text(before_row)union select key,value from jsonb_each_text(after_row)loop
   if field.value is null then continue;end if;
   ids:=case field.key
    when 'residence_id'then scope->'residences' when 'block_id'then scope->'blocks' when 'assigned_block_id'then scope->'blocks'
    when 'floor_id'then scope->'floors'when 'room_id'then scope->'rooms'when 'bed_id'then scope->'beds'
    when 'allocation_id'then scope->'allocations'when 'staff_assignment_id'then scope->'staff_assignments'
    when 'assigned_staff_id'then scope->'staff_assignments'when 'assigned_staff_assignment_id'then scope->'staff_assignments'
    when 'issue_id'then scope->'maintenance_issues'when 'case_id'then scope->'verification_cases'when 'inspection_id'then scope->'verification_inspections'
    when 'store_id'then scope->'stores'when 'listing_id'then scope->'listings'when 'order_id'then scope->'market_orders'when 'payment_id'then scope->'payments'
    when 'account_context_id'then scope->'account_contexts'when 'context_id'then scope->'account_contexts'
    when 'manager_context_id'then scope->'account_contexts'when 'created_by_manager_id'then scope->'account_contexts'
    when 'resident_context_id'then scope->'account_contexts'when 'staff_context_id'then scope->'account_contexts'
    when 'seller_context_id'then scope->'account_contexts'when 'buyer_context_id'then scope->'account_contexts'
    when 'owner_context_id'then scope->'account_contexts'when 'linked_context_id'then scope->'account_contexts'
    when 'initiator_context_id'then scope->'account_contexts'when 'applicant_context_id'then scope->'account_contexts'
    when 'reporter_context_id'then scope->'account_contexts'when 'actor_context_id'then scope->'account_contexts'
    when 'primary_owner_id'then roots else '[]'::jsonb end;
   if(field.key in('id','context_id','issue_id')and coalesce(scope->table_name ? field.value,false))or coalesce(ids ? field.value,false)then return true;end if;
  end loop;
 end loop;return false;
end;
$$;
create function private.system_wipe_writer_lock()returns trigger language plpgsql set search_path=''as $$
begin
 if current_setting('transaction_isolation')<>'read committed'then raise exception using errcode='42501',message='Reviewed domain writes require READ COMMITTED';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));return null;
end;
$$;

create function private.system_wipe_frozen_recovery_guard()returns trigger language plpgsql set search_path=''as $$
begin
 if exists(select 1 from private.system_wipe_freezes f where f.preparation_id=new.preparation_id and f.state='frozen'and new.checkpoint_created_at<f.created_at)then
  raise exception using errcode='42501',message='Recovery checkpoint must include the actual write pause';end if;return new;
end;
$$;
create trigger system_wipe_frozen_recovery_guard before insert on private.system_wipe_recovery_evidence for each row execute function private.system_wipe_frozen_recovery_guard();

create table private.system_wipe_execution_authorizations(
 id uuid primary key default gen_random_uuid(),preparation_id uuid not null references private.system_wipe_freezes(preparation_id),
 founder_context_id uuid not null references public.admin_memberships(context_id),auth_user_id uuid not null,session_id uuid not null,approval_key_version uuid not null,
 scope_digest text not null check(scope_digest ~ '^[a-f0-9]{64}$'),native_catalog_digest text not null check(native_catalog_digest ~ '^[a-f0-9]{64}$'),
 freeze_created_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp(),
 check(expires_at>created_at and expires_at<=created_at+interval'5 minutes')
);
create index system_wipe_execution_authorizations_preparation_idx on private.system_wipe_execution_authorizations(preparation_id,created_at desc);
alter table private.system_wipe_execution_authorizations enable row level security;
revoke all on private.system_wipe_execution_authorizations from public,anon,authenticated,pinevela_backend;
create function private.system_wipe_execution_authorization_current(a private.system_wipe_execution_authorizations)returns boolean
 language sql stable set search_path=''as $$
 select coalesce(a.created_at<=clock_timestamp()and a.expires_at>clock_timestamp()and a.expires_at<=a.created_at+interval'5 minutes'and private.platform_available()
  and exists(select 1 from private.system_wipe_freezes f join private.system_wipe_preparations prep on prep.id=f.preparation_id
   join public.admin_proposals p on p.id=prep.proposal_id join private.system_wipe_recovery_evidence r on r.preparation_id=prep.id
   join public.admin_memberships m on m.context_id=a.founder_context_id join public.account_contexts c on c.id=m.context_id
   join private.admin_secrets k on k.context_id=c.id join private.account_sessions b on b.session_id=a.session_id and b.auth_user_id=a.auth_user_id
   where prep.id=a.preparation_id and prep.state='active'and f.state='frozen'and p.status='approved'
    and private.system_wipe_current(p)and private.system_wipe_quorum(p.id)and private.system_wipe_pause_ready(p)
    and p.wipe_final_decision='approve-backup'and p.wipe_founder_context_id=a.founder_context_id
    and f.founder_context_id=a.founder_context_id and m.slot=1 and m.status='active'and c.status='active'and c.kind='admin'and c.auth_user_id=a.auth_user_id
    and b.active_context_id=c.id and private.portal_session_allowed(c.id,b.portal_pin_version)
    and private.administrator_session_allowed(c.id,a.session_id)and private.account_session_allowed(c.id,a.session_id)
    and k.approval_key_hash is not null and k.approval_key_version=a.approval_key_version and(k.locked_until is null or k.locked_until<=clock_timestamp())
    and a.scope_digest=f.scope_digest and a.scope_digest=prep.scope_digest and a.scope_digest=p.baseline_digest and a.freeze_created_at=f.created_at
    and r.checkpoint_created_at>=f.created_at and a.native_catalog_digest=r.native_catalog_digest and a.native_catalog_digest=private.residence_recovery_catalog_digest()),false);
$$;
create function private.system_wipe_execution_authorization_guard()returns trigger language plpgsql set search_path=''as $$
declare actor uuid;p public.admin_proposals;
begin
 if tg_op<>'INSERT'then raise exception using errcode='42501',message='Final wipe consent is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed'then raise exception using errcode='42501',message='Final wipe consent requires READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 select p0.* into p from public.admin_proposals p0 join private.system_wipe_preparations f on f.proposal_id=p0.id where f.id=new.preparation_id for update of p0;
 new.created_at:=clock_timestamp();new.expires_at:=least(new.created_at+interval'5 minutes',p.expires_at);
 if actor is null or actor is distinct from new.founder_context_id or new.auth_user_id is distinct from auth.uid()
  or new.session_id::text is distinct from auth.jwt()->>'session_id'
  or new.approval_key_version::text is distinct from current_setting('pinevela.approval_key_version',true)
  or current_setting('pinevela.system_wipe_execution_confirmation',true)is distinct from 'AUTHORIZE REVIEWED WIPE'
  or not private.system_wipe_execution_authorization_current(new)then raise exception using errcode='42501',message='Current own-key founder, paused scope and verified post-pause recovery required';end if;
 if exists(select 1 from private.system_wipe_execution_authorizations x where x.preparation_id=new.preparation_id and private.system_wipe_execution_authorization_current(x))then
  raise exception using errcode='23505',message='Current final wipe consent is already recorded';end if;return new;
end;
$$;
create trigger system_wipe_execution_authorization_guard before insert or update or delete on private.system_wipe_execution_authorizations for each row execute function private.system_wipe_execution_authorization_guard();
create trigger system_wipe_execution_authorization_truncate_guard before truncate on private.system_wipe_execution_authorizations for each statement execute function private.system_wipe_execution_authorization_guard();
revoke all on function private.system_wipe_pause_ready(public.admin_proposals),private.system_wipe_freeze_guard(),private.system_wipe_pause_cancelled(),
 private.system_wipe_row_paused(text,text,jsonb,jsonb),private.system_wipe_writer_lock(),private.system_wipe_frozen_recovery_guard(),
 private.system_wipe_execution_authorization_current(private.system_wipe_execution_authorizations),private.system_wipe_execution_authorization_guard()
 from public,anon,authenticated,pinevela_backend;

-- Preserve the existing residence execution and metadata-only trigger guards.
create or replace function private.residence_freeze_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}';after_row jsonb:='{}';item record;fields record;scope jsonb;ids jsonb;table_ids jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_op='UPDATE' and before_row=after_row then return new;end if;
 if private.system_wipe_row_paused(tg_table_schema,tg_table_name,before_row,after_row)then
  raise exception using errcode='55000',message='Reviewed wipe records are paused for recovery verification';end if;
 if exists(select 1 from private.residence_executions where state='running' and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid())
  and not private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row) then
  raise exception using errcode='42501',message='Execution may change only its exact reviewed rows and operations';end if;
 for item in select f.id,p.preview from private.residence_deletion_preparations f
  join public.admin_proposals p on p.id=f.proposal_id where f.state='frozen' loop
  scope:=item.preview->'resources';table_ids:=coalesce(scope->tg_table_name,'[]'::jsonb);
  for fields in select key,value from jsonb_each_text(before_row) union select key,value from jsonb_each_text(after_row) loop
   if fields.value is null then continue;end if;
   ids:=case fields.key
    when 'residence_id' then scope->'residences' when 'block_id' then scope->'blocks'
    when 'assigned_block_id' then scope->'blocks' when 'floor_id' then scope->'floors'
    when 'room_id' then scope->'rooms' when 'bed_id' then scope->'beds'
    when 'allocation_id' then scope->'allocations' when 'staff_assignment_id' then scope->'staff_assignments'
    when 'assigned_staff_assignment_id' then scope->'staff_assignments' when 'issue_id' then scope->'maintenance_issues'
    when 'case_id' then scope->'verification_cases' when 'inspection_id' then scope->'verification_inspections'
    when 'account_context_id' then scope->'account_contexts' when 'context_id' then scope->'account_contexts'
    when 'manager_context_id' then scope->'account_contexts' when 'created_by_manager_id' then scope->'account_contexts'
    when 'resident_context_id' then scope->'account_contexts' when 'staff_context_id' then scope->'account_contexts'
    when 'owner_context_id' then scope->'account_contexts' when 'linked_context_id' then scope->'account_contexts'
    when 'initiator_context_id' then scope->'account_contexts' when 'applicant_context_id' then scope->'account_contexts'
    when 'reporter_context_id' then scope->'account_contexts' when 'actor_context_id' then scope->'account_contexts'
    when 'auth_user_id' then scope->'profiles' when 'primary_owner_id' then scope->'profiles'
    else '[]'::jsonb end;
   if (fields.key in('id','context_id','issue_id') and table_ids ? fields.value) or coalesce(ids ? fields.value,false) then
    if private.residence_execution_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row,item.id) then continue;end if;
    raise exception using errcode='55000',message='Reviewed housing records are paused for backup preparation';end if;
  end loop;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create or replace function private.residence_freeze_truncate_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 if exists(select 1 from private.system_wipe_freezes where state='frozen')then
  raise exception using errcode='55000',message='Reviewed wipe records are paused for recovery verification';end if;
 if tg_table_name='residence_deletion_preparations' then
  raise exception using errcode='42501',message='Residence preparation history is immutable';end if;
 if exists(select 1 from private.residence_deletion_preparations where state='frozen') then
  raise exception using errcode='55000',message='Reviewed housing records are paused for backup preparation';end if;
 return null;
end;
$$;
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.residences for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.manager_assignments for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.blocks for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.floors for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.rooms for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.beds for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.allocations for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.staff_assignments for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.verification_cases for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.verification_inspections for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.residence_change_requests for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.maintenance_issues for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.maintenance_events for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.repair_reviews for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.staff_reviews for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.meetings for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.staff_bargains for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.payments for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.account_contexts for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.profiles for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.room_activation_keys for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.account_enrollments for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.registration_bans for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.account_policies for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.media_assets for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.manager_settings for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.seller_applications for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.stores for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.listings for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.listing_media for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.listing_price_options for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.store_subscriptions for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.store_fee_periods for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.market_orders for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.market_messages for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.market_reviews for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.payment_checkouts for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.residence_room_key_cycles for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on private.manager_operation_keys for each statement execute function private.system_wipe_writer_lock();
create trigger aa0_system_wipe_writer_lock before insert or update or delete on storage.objects for each statement execute function private.system_wipe_writer_lock();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.seller_applications for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.seller_applications for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.seller_applications for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.stores for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.stores for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.stores for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.listings for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.listings for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.listings for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.listing_media for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.listing_media for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.listing_media for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.listing_price_options for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.listing_price_options for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.listing_price_options for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.store_subscriptions for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.store_subscriptions for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.store_subscriptions for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.store_fee_periods for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.store_fee_periods for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.store_fee_periods for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.market_orders for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.market_orders for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.market_orders for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.market_messages for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.market_messages for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.market_messages for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on public.market_reviews for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on public.market_reviews for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on public.market_reviews for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on private.payment_checkouts for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on private.payment_checkouts for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on private.payment_checkouts for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on private.residence_room_key_cycles for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on private.residence_room_key_cycles for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on private.residence_room_key_cycles for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on private.manager_operation_keys for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on private.manager_operation_keys for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on private.manager_operation_keys for each statement execute function private.residence_freeze_truncate_guard();
create trigger aab_system_wipe_write_guard before insert or update or delete on storage.objects for each row execute function private.residence_freeze_write_guard();
create trigger zzz_system_wipe_write_guard after insert or update or delete on storage.objects for each row execute function private.residence_freeze_write_guard();
create trigger system_wipe_truncate_guard before truncate on storage.objects for each statement execute function private.residence_freeze_truncate_guard();
revoke all on function private.residence_freeze_write_guard(),private.residence_freeze_truncate_guard()from public,anon,authenticated,pinevela_backend;
