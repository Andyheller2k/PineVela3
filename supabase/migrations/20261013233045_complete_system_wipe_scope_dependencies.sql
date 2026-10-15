-- Complete native review/pause dependencies; no operational execution is enabled.
select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
select pg_advisory_xact_lock(hashtextextended('platform-settings',0));
do $$begin
 if exists(select 1 from private.system_wipe_freezes where state='frozen') then
  raise exception using errcode='55000',message='Cancel existing wipe pauses before changing reviewed scope dependencies';end if;
end;$$;

-- Relationship lookup for dependency review only, never an account access grant.
create function private.system_wipe_enrollment_selected(e private.account_enrollments,preview jsonb)returns boolean
language sql stable set search_path='' as $$
 select coalesce(
  preview->'scopes' ? 'total' and e.status in('pending_email','pending_review')
  or preview->'scopes' ? 'markets' and e.kind='seller' and e.status in('pending_email','pending_review')
  or preview#>'{resources,account_contexts}' ? e.initiator_context_id::text
  or preview#>'{resources,account_contexts}' ? e.linked_context_id::text
  or preview#>'{resources,residences}' ? e.residence_id::text
  or preview#>'{resources,rooms}' ? e.room_id::text
  or jsonb_path_query_array(preview,'$.accounts[*] ? (@.kind == "primary").authUserId') ? e.primary_owner_id::text
  or e.kind='officer' and (
   jsonb_path_query_array(preview,'$.accounts[*] ? (@.kind == "primary").authUserId') ? e.officer_reserved_subject::text
   or e.officer_reserved_subject is null and exists(select 1 from auth.users u
    where jsonb_path_query_array(preview,'$.accounts[*] ? (@.kind == "primary").authUserId') ? u.id::text
     and lower(u.email)=e.invited_email)),false);
$$;
revoke all on function private.system_wipe_enrollment_selected(private.account_enrollments,jsonb)from public,anon,authenticated,pinevela_backend;

create or replace function private.system_wipe_preview(scopes jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare scope_contexts uuid[]:='{}';scope_homes uuid[]:='{}';scope_stores uuid[]:='{}';scope_roots uuid[]:='{}';scope_blocks uuid[];scope_floors uuid[];scope_rooms uuid[];
 scope_listings uuid[];scope_orders uuid[];scope_cases uuid[];scope_issues uuid[];scope_payments uuid[];scope_subjects uuid[];size_before integer;resources jsonb:='{}';data jsonb:='{}';ids uuid[];entry record;enrollment_scope jsonb;retained jsonb:='{}';
begin
 if not coalesce(private.valid_system_wipe_scopes(scopes),false) then raise exception using errcode='22023',message='Valid distinct system wipe scopes required';end if;
 select coalesce(array_agg(c.id order by c.id),'{}') into scope_contexts from public.account_contexts c
 where c.kind<>'admin' and c.status<>'closed' and (scopes ? 'total' or scopes ? 'users' and c.kind='primary' or scopes ? 'managers' and c.kind='manager' or scopes ? 'residents' and c.kind='resident' or scopes ? 'markets' and c.kind='seller');
 if scopes ? 'total' or scopes ? 'hostels' then select coalesce(array_agg(id order by id),'{}') into scope_homes from public.residences where status<>'closed';end if;
 if scopes ? 'total' or scopes ? 'markets' then select coalesce(array_agg(id order by id),'{}') into scope_stores from public.stores where status<>'closed';end if;
 loop
  size_before:=cardinality(scope_contexts)+cardinality(scope_homes)+cardinality(scope_stores);
  select coalesce(array_agg(auth_user_id order by auth_user_id),'{}') into scope_roots from public.account_contexts where id=any(scope_contexts) and kind='primary';
  select coalesce(array_agg(distinct id order by id),'{}') into scope_homes from public.residences h where h.status<>'closed' and (h.id=any(scope_homes) or h.primary_owner_id=any(scope_roots)
   or exists(select 1 from public.manager_assignments a where a.residence_id=h.id and a.manager_context_id=any(scope_contexts) and a.ended_at is null));
  select coalesce(array_agg(distinct id order by id),'{}') into scope_stores from public.stores s where s.status<>'closed' and (s.id=any(scope_stores) or s.seller_context_id=any(scope_contexts) or s.primary_owner_id=any(scope_roots));
  select coalesce(array_agg(distinct c.id order by c.id),'{}') into scope_contexts from public.account_contexts c where c.kind<>'admin' and c.status<>'closed' and (
   c.id=any(scope_contexts) or c.primary_owner_id=any(scope_roots)
   or c.kind='seller' and exists(select 1 from public.stores s where s.id=any(scope_stores) and s.seller_context_id=c.id)
   or c.kind='staff' and exists(select 1 from public.staff_assignments a where a.staff_context_id=c.id and a.ended_at is null and (a.residence_id=any(scope_homes) or a.created_by_manager_id=any(scope_contexts)))
   or c.kind='resident' and exists(select 1 from public.allocations a join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
     where a.resident_context_id=c.id and a.ended_at is null and b.residence_id=any(scope_homes)));
  exit when size_before=cardinality(scope_contexts)+cardinality(scope_homes)+cardinality(scope_stores);
 end loop;
 if cardinality(scope_contexts)+cardinality(scope_homes)+cardinality(scope_stores)>50000 then raise exception using errcode='54000',message='Scope requires an operator-reviewed bulk plan';end if;
 select coalesce(array_agg(id order by id),'{}') into scope_blocks from public.blocks where residence_id=any(scope_homes);
 select coalesce(array_agg(id order by id),'{}') into scope_floors from public.floors where block_id=any(scope_blocks);
 select coalesce(array_agg(distinct r.id order by r.id),'{}') into scope_rooms from public.rooms r where r.floor_id=any(scope_floors)
  or exists(select 1 from public.allocations a where a.room_id=r.id and a.resident_context_id=any(scope_contexts) and a.ended_at is null);
 select coalesce(array_agg(id order by id),'{}') into scope_listings from public.listings where store_id=any(scope_stores);
 select coalesce(array_agg(id order by id),'{}') into scope_orders from public.market_orders where store_id=any(scope_stores) or buyer_context_id=any(scope_contexts);
 select coalesce(array_agg(id order by id),'{}') into scope_cases from public.verification_cases where residence_id=any(scope_homes) or applicant_context_id=any(scope_contexts);
 select coalesce(array_agg(id order by id),'{}') into scope_issues from public.maintenance_issues where residence_id=any(scope_homes) or reporter_context_id=any(scope_contexts) or room_id=any(scope_rooms);
 select coalesce(array_agg(id order by id),'{}') into scope_payments from public.payments where residence_id=any(scope_homes) or store_id=any(scope_stores) or actor_context_id=any(scope_contexts);
 select coalesce(array_agg(distinct id order by id),'{}') into scope_subjects from public.profiles where id in(select auth_user_id from public.account_contexts where id=any(scope_contexts))
  or id in(select primary_owner_id from public.residences where id=any(scope_homes)) or id in(select primary_owner_id from public.stores where id=any(scope_stores));
 select coalesce(array_agg(id order by id),'{}') into ids from public.account_contexts where id=any(scope_contexts);
 resources:=resources||jsonb_build_object('account_contexts',to_jsonb(ids));data:=data||jsonb_build_object('account_contexts',private.system_wipe_row_digests('public.account_contexts'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.profiles where id=any(scope_subjects);
 resources:=resources||jsonb_build_object('profiles',to_jsonb(ids));data:=data||jsonb_build_object('profiles',private.system_wipe_row_digests('public.profiles'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.residences where id=any(scope_homes);
 resources:=resources||jsonb_build_object('residences',to_jsonb(ids));data:=data||jsonb_build_object('residences',private.system_wipe_row_digests('public.residences'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.manager_assignments where residence_id=any(scope_homes) or manager_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('manager_assignments',to_jsonb(ids));data:=data||jsonb_build_object('manager_assignments',private.system_wipe_row_digests('public.manager_assignments'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.blocks where id=any(scope_blocks);
 resources:=resources||jsonb_build_object('blocks',to_jsonb(ids));data:=data||jsonb_build_object('blocks',private.system_wipe_row_digests('public.blocks'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.floors where id=any(scope_floors);
 resources:=resources||jsonb_build_object('floors',to_jsonb(ids));data:=data||jsonb_build_object('floors',private.system_wipe_row_digests('public.floors'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.rooms where id=any(scope_rooms);
 resources:=resources||jsonb_build_object('rooms',to_jsonb(ids));data:=data||jsonb_build_object('rooms',private.system_wipe_row_digests('public.rooms'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.beds where room_id=any(scope_rooms);
 resources:=resources||jsonb_build_object('beds',to_jsonb(ids));data:=data||jsonb_build_object('beds',private.system_wipe_row_digests('public.beds'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.allocations where room_id=any(scope_rooms) or resident_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('allocations',to_jsonb(ids));data:=data||jsonb_build_object('allocations',private.system_wipe_row_digests('public.allocations'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('staff_assignments',to_jsonb(ids));data:=data||jsonb_build_object('staff_assignments',private.system_wipe_row_digests('public.staff_assignments'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.verification_cases where id=any(scope_cases);
 resources:=resources||jsonb_build_object('verification_cases',to_jsonb(ids));data:=data||jsonb_build_object('verification_cases',private.system_wipe_row_digests('public.verification_cases'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.verification_inspections where case_id=any(scope_cases);
 resources:=resources||jsonb_build_object('verification_inspections',to_jsonb(ids));data:=data||jsonb_build_object('verification_inspections',private.system_wipe_row_digests('public.verification_inspections'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.residence_change_requests where residence_id=any(scope_homes) or manager_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('residence_change_requests',to_jsonb(ids));data:=data||jsonb_build_object('residence_change_requests',private.system_wipe_row_digests('public.residence_change_requests'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.maintenance_issues where id=any(scope_issues);
 resources:=resources||jsonb_build_object('maintenance_issues',to_jsonb(ids));data:=data||jsonb_build_object('maintenance_issues',private.system_wipe_row_digests('public.maintenance_issues'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.maintenance_events where issue_id=any(scope_issues);
 resources:=resources||jsonb_build_object('maintenance_events',to_jsonb(ids));data:=data||jsonb_build_object('maintenance_events',private.system_wipe_row_digests('public.maintenance_events'::regclass,ids));
 select coalesce(array_agg(issue_id order by issue_id),'{}') into ids from public.repair_reviews where issue_id=any(scope_issues);
 resources:=resources||jsonb_build_object('repair_reviews',to_jsonb(ids));data:=data||jsonb_build_object('repair_reviews',private.system_wipe_row_digests('public.repair_reviews'::regclass,ids,'issue_id'));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_reviews where resident_context_id=any(scope_contexts) or allocation_id in(select id from public.allocations where room_id=any(scope_rooms)) or staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts));
 resources:=resources||jsonb_build_object('staff_reviews',to_jsonb(ids));data:=data||jsonb_build_object('staff_reviews',private.system_wipe_row_digests('public.staff_reviews'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.meetings where residence_id=any(scope_homes) or participant_context_id=any(scope_contexts)
  or requested_by_context_id=any(scope_contexts) or manager_context_id=any(scope_contexts)
  or allocation_id in(select id from public.allocations where resident_context_id=any(scope_contexts) or room_id=any(scope_rooms))
  or staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts));
 resources:=resources||jsonb_build_object('meetings',to_jsonb(ids));data:=data||jsonb_build_object('meetings',private.system_wipe_row_digests('public.meetings'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_bargains where manager_context_id=any(scope_contexts) or staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts));
 resources:=resources||jsonb_build_object('staff_bargains',to_jsonb(ids));data:=data||jsonb_build_object('staff_bargains',private.system_wipe_row_digests('public.staff_bargains'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.seller_applications where seller_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('seller_applications',to_jsonb(ids));data:=data||jsonb_build_object('seller_applications',private.system_wipe_row_digests('public.seller_applications'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.stores where id=any(scope_stores);
 resources:=resources||jsonb_build_object('stores',to_jsonb(ids));data:=data||jsonb_build_object('stores',private.system_wipe_row_digests('public.stores'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.listings where id=any(scope_listings);
 resources:=resources||jsonb_build_object('listings',to_jsonb(ids));data:=data||jsonb_build_object('listings',private.system_wipe_row_digests('public.listings'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.listing_media where listing_id=any(scope_listings);
 resources:=resources||jsonb_build_object('listing_media',to_jsonb(ids));data:=data||jsonb_build_object('listing_media',private.system_wipe_row_digests('public.listing_media'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.listing_price_options where listing_id=any(scope_listings);
 resources:=resources||jsonb_build_object('listing_price_options',to_jsonb(ids));data:=data||jsonb_build_object('listing_price_options',private.system_wipe_row_digests('public.listing_price_options'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.market_orders where id=any(scope_orders);
 resources:=resources||jsonb_build_object('market_orders',to_jsonb(ids));data:=data||jsonb_build_object('market_orders',private.system_wipe_row_digests('public.market_orders'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.market_messages where store_id=any(scope_stores) or buyer_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('market_messages',to_jsonb(ids));data:=data||jsonb_build_object('market_messages',private.system_wipe_row_digests('public.market_messages'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.market_reviews where order_id=any(scope_orders);
 resources:=resources||jsonb_build_object('market_reviews',to_jsonb(ids));data:=data||jsonb_build_object('market_reviews',private.system_wipe_row_digests('public.market_reviews'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.payments where id=any(scope_payments);
 resources:=resources||jsonb_build_object('payments',to_jsonb(ids));data:=data||jsonb_build_object('payments',private.system_wipe_row_digests('public.payments'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.store_subscriptions where store_id=any(scope_stores);
 resources:=resources||jsonb_build_object('store_subscriptions',to_jsonb(ids));data:=data||jsonb_build_object('store_subscriptions',private.system_wipe_row_digests('public.store_subscriptions'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.store_fee_periods where store_id=any(scope_stores);
 resources:=resources||jsonb_build_object('store_fee_periods',to_jsonb(ids));data:=data||jsonb_build_object('store_fee_periods',private.system_wipe_row_digests('public.store_fee_periods'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.media_assets where owner_context_id=any(scope_contexts) or residence_id=any(scope_homes) or issue_id=any(scope_issues) or allocation_id in(select id from public.allocations where room_id=any(scope_rooms) or resident_context_id=any(scope_contexts)) or inspection_id in(select id from public.verification_inspections where case_id=any(scope_cases))
  or '/api/media/'||id::text in(select cover_path from public.residences where id=any(scope_homes)
   union select unnest(gallery_paths) from public.residences where id=any(scope_homes)
   union select logo_path from public.stores where id=any(scope_stores)
   union select cover_path from public.stores where id=any(scope_stores)
   union select avatar_path from public.profiles where id=any(scope_subjects)
   union select image_path from public.listing_price_options where listing_id=any(scope_listings));
 resources:=resources||jsonb_build_object('media_assets',to_jsonb(ids));data:=data||jsonb_build_object('media_assets',private.system_wipe_row_digests('public.media_assets'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from private.room_activation_keys where room_id=any(scope_rooms);
 resources:=resources||jsonb_build_object('room_activation_keys',to_jsonb(ids));data:=data||jsonb_build_object('room_activation_keys',private.system_wipe_row_digests('private.room_activation_keys'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from private.residence_room_key_cycles where residence_id=any(scope_homes);
 resources:=resources||jsonb_build_object('residence_room_key_cycles',to_jsonb(ids));data:=data||jsonb_build_object('residence_room_key_cycles',private.system_wipe_row_digests('private.residence_room_key_cycles'::regclass,ids));

 -- Session tokens and credential hashes never enter a preview.
 data:=data||jsonb_build_object('account_bindings',(select coalesce(jsonb_agg(jsonb_build_object('contextId',active_context_id,'digest',encode(sha256(convert_to(to_jsonb(binding)::text,'UTF8')),'hex')) order by session_id),'[]') from private.account_sessions binding where active_context_id=any(scope_contexts)));
 data:=data||jsonb_build_object('manager_keys',(select coalesce(jsonb_agg(jsonb_build_object('contextId',manager_context_id,'version',version,'issued',issued_at)order by manager_context_id),'[]') from private.manager_operation_keys where manager_context_id=any(scope_contexts)));
 enrollment_scope:=jsonb_build_object('scopes',scopes,'resources',resources,'accounts',
  (select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'authUserId',auth_user_id)),'[]') from public.account_contexts where id=any(scope_contexts)));
 select coalesce(array_agg(id order by id),'{}') into ids from private.account_enrollments e
  where e.status in('pending_email','pending_review') and private.system_wipe_enrollment_selected(e,enrollment_scope);
 resources:=resources||jsonb_build_object('account_enrollments',to_jsonb(ids));
 data:=data||jsonb_build_object('pending_enrollments',(select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'kind',kind,'status',status,'contextId',linked_context_id,'roomId',room_id,'residenceId',residence_id,'expires',expires_at,
  'digest',encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex'))order by id),'[]')
  from private.account_enrollments e where private.system_wipe_enrollment_selected(e,enrollment_scope)));
 select coalesce(array_agg(id order by id),'{}') into ids from private.room_key_deliveries
  where actor_context_id=any(scope_contexts) or recipient_context_id=any(scope_contexts) or residence_id=any(scope_homes) or room_id=any(scope_rooms);
 retained:=retained||jsonb_build_object('room_key_deliveries',to_jsonb(ids));
 data:=data||jsonb_build_object('room_key_deliveries',private.system_wipe_row_digests('private.room_key_deliveries'::regclass,ids));
 select coalesce(array_agg(notification_id order by notification_id),'{}') into ids from private.room_key_deliveries where id=any(ids);
 retained:=retained||jsonb_build_object('room_key_delivery_notifications',to_jsonb(ids));
 data:=data||jsonb_build_object('room_key_delivery_notifications',private.system_wipe_row_digests('public.notifications'::regclass,ids));
 data:=data||jsonb_build_object('room_key_delivery_recipients',(select coalesce(jsonb_agg(jsonb_build_object(
  'notificationId',notification_id,'contextId',context_id,'digest',encode(sha256(convert_to(
  jsonb_build_object('notification_id',notification_id,'context_id',context_id)::text,'UTF8')),'hex'))order by notification_id,context_id),'[]')
  from public.notification_recipients where notification_id=any(ids)));

 data:=data||jsonb_build_object('payment_checkouts',(select coalesce(jsonb_agg(jsonb_build_object('paymentId',payment_id,'digest',encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')) order by payment_id),'[]') from private.payment_checkouts e where payment_id=any(scope_payments)));
 if(select sum(jsonb_array_length(value))from jsonb_each(data))>50000 then raise exception using errcode='54000',message='Scope requires an operator-reviewed bulk plan';end if;
 return jsonb_build_object('version',1,'resourceRevision',(select revision from private.residence_review_state where singleton),'scopes',scopes,'resources',resources,'retainedDependencies',retained,'rowDigests',data,'roster',private.recovery_roster(),
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'name',p.display_name,'status',c.status,'authUserId',c.auth_user_id,'effect','close-portal')order by c.kind,c.id),'[]') from public.account_contexts c join public.profiles p on p.id=c.auth_user_id where c.id=any(scope_contexts)),
  'residences',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'effect','withdraw-and-retain-history')order by id),'[]') from public.residences where id=any(scope_homes)),
  'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'effect','close-and-retain-history')order by id),'[]') from public.stores where id=any(scope_stores)),
  'counts',(select jsonb_object_agg(key,jsonb_array_length(value)) from jsonb_each(data)),
  'retention',jsonb_build_object('authIdentities',true,'accountHistory',true,'administrators',true,'governance',true,'payments',true,'notifications',true,'storageBytes',true,'platformSettings',true),
  'obligations',jsonb_build_object('openOrders',(select count(*) from public.market_orders where id=any(scope_orders) and status in('awaiting_seller','pending_meetup')),
    'unsettledPayments',(select count(*) from public.payments where id=any(scope_payments) and status in('initialized','pending')),
    'pausedResidenceReviews',(select count(*) from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id where f.state='frozen' and exists(select 1 from jsonb_array_elements_text(p.preview#>'{resources,residences}') item where item::uuid=any(scope_homes)))),
  'executionAvailable',false);
end;
$$;
create or replace function private.system_wipe_pause_ready(p public.admin_proposals)returns boolean
 language sql stable set search_path='' as $$
 select coalesce((p.preview#>>'{obligations,openOrders}')::bigint=0
  and (p.preview#>>'{obligations,unsettledPayments}')::bigint=0
  and (p.preview#>>'{obligations,pausedResidenceReviews}')::bigint=0
  and not exists(select 1 from public.media_assets m where m.state in('reserved','removing') and (
   p.preview#>'{resources,media_assets}' ? m.id::text
   or p.preview#>'{resources,account_contexts}' ? m.owner_context_id::text
   or p.preview#>'{resources,residences}' ? m.residence_id::text))
  and not exists(select 1 from private.account_enrollments e where e.status='pending_email'and e.expires_at>clock_timestamp()
   and private.system_wipe_enrollment_selected(e,p.preview)),false);
$$;
create or replace function private.system_wipe_row_paused(schema_name text,table_name text,before_row jsonb,after_row jsonb)returns boolean
 language plpgsql set search_path='' as $$
declare item record;scope jsonb;roots jsonb;field record;ids jsonb;row_value jsonb;
begin
 for item in select p.preview from private.system_wipe_freezes f join private.system_wipe_preparations prep on prep.id=f.preparation_id
  join public.admin_proposals p on p.id=prep.proposal_id where f.state='frozen'loop
  scope:=item.preview->'resources';roots:=jsonb_path_query_array(item.preview,'$.accounts[*] ? (@.kind == "primary").authUserId');
  if schema_name='private'and table_name='account_enrollments' then
   if private.system_wipe_enrollment_selected(jsonb_populate_record(null::private.account_enrollments,before_row),item.preview)
    or private.system_wipe_enrollment_selected(jsonb_populate_record(null::private.account_enrollments,after_row),item.preview)then return true;end if;
   continue;
  end if;
  if schema_name='public'and table_name in('notifications','notification_recipients')then
   if table_name='notification_recipients'and before_row-array['read_at','popup_acknowledged_at']=after_row-array['read_at','popup_acknowledged_at']then continue;end if;
   for row_value in select before_row union select after_row loop
    if item.preview#>'{retainedDependencies,room_key_delivery_notifications}' ?
     (case when table_name='notifications'then row_value->>'id'else row_value->>'notification_id'end)then return true;end if;
   end loop;
   continue;
  end if;
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
    when 'requested_by_context_id'then scope->'account_contexts'when 'participant_context_id'then scope->'account_contexts'when 'recipient_context_id'then scope->'account_contexts'
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
create or replace function private.residence_freeze_write_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb:='{}';after_row jsonb:='{}';item record;fields record;scope jsonb;ids jsonb;table_ids jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_op='UPDATE' and before_row=after_row then return new;end if;
 -- Notification hooks enforce only immutable retained dependency metadata.
 -- Existing receipt cores still create their own notices atomically.
 if tg_table_schema='public'and tg_table_name in('notifications','notification_recipients')then
  if private.system_wipe_row_paused(tg_table_schema,tg_table_name,before_row,after_row)then
   raise exception using errcode='55000',message='Reviewed delivery notification content is paused';end if;
  return case when tg_op='DELETE'then old else new end;
 end if;
 if exists(select 1 from private.primary_wipe_executions where state='running'and transaction_id=pg_current_xact_id()::text and backend_pid=pg_backend_pid())
  and not private.primary_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row)then
  raise exception using errcode='42501',message='Primary execution may change only its exact reviewed primary statuses';end if;
 if private.system_wipe_row_paused(tg_table_schema,tg_table_name,before_row,after_row)
  and not private.primary_wipe_write_allowed(tg_table_schema,tg_table_name,tg_op,before_row,after_row)then
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

-- Metadata-only hooks reuse the existing reviewed trigger boundary; no new
-- SECURITY DEFINER authorization function or widened base-table grant is added.
do $$declare relation text;begin
 foreach relation in array array['notifications','notification_recipients']loop
  execute format('create trigger aa0_system_wipe_writer_lock before insert or update or delete on public.%I for each statement execute function private.system_wipe_writer_lock()',relation);
  execute format('create trigger aab_system_wipe_write_guard before insert or update or delete on public.%I for each row execute function private.residence_freeze_write_guard()',relation);
  execute format('create trigger zzz_system_wipe_write_guard after insert or update or delete on public.%I for each row execute function private.residence_freeze_write_guard()',relation);
  execute format('create trigger system_wipe_truncate_guard before truncate on public.%I for each statement execute function private.residence_freeze_truncate_guard()',relation);
 end loop;
end;$$;
revoke all on function private.system_wipe_preview(jsonb),private.system_wipe_row_paused(text,text,jsonb,jsonb),
 private.system_wipe_pause_ready(public.admin_proposals)from public,anon,authenticated,pinevela_backend;
