-- Scope previews and independent consent only. No operational wipe execution.
alter table public.admin_proposals add column wipe_roster_revision bigint,
 add column wipe_resource_revision bigint,add column wipe_final_decision text,
 add column wipe_founder_context_id uuid references public.admin_memberships(context_id),
 add column wipe_final_reason text,add column wipe_final_decided_at timestamptz;
-- Existing pre-protocol rows are history, never new authority.
update public.admin_proposals set status='invalidated' where kind='system_wipe' and status in('pending','approved');
alter table public.admin_proposals add constraint wipe_final_decision_shape check(
 (wipe_final_decision is null and wipe_founder_context_id is null and wipe_final_reason is null and wipe_final_decided_at is null)
 or kind='system_wipe' and wipe_final_decision is not null and wipe_final_decision in('approve-backup','reject') and wipe_founder_context_id is not null
  and wipe_final_reason is not null and length(btrim(wipe_final_reason)) between 3 and 500 and wipe_final_decided_at is not null);

create function private.valid_system_wipe_scopes(scopes jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(scopes) is distinct from 'array' then false else
  jsonb_array_length(scopes) between 1 and 6 and not exists(select 1 from jsonb_array_elements(scopes) item where jsonb_typeof(item)<>'string' or item#>>'{}' not in('hostels','markets','managers','residents','users','total'))
  and (select count(*)=count(distinct item) from jsonb_array_elements(scopes) item) and (not scopes ? 'total' or scopes='["total"]'::jsonb)
  and scopes=(select jsonb_agg(value order by ord)from unnest(array['hostels','markets','managers','residents','users','total'])with ordinality as s(value,ord)where scopes ? value) end;
$$;
-- Reuse existing protected domain revision evidence; notifications and polling do not alter it.
create trigger wipe_review_domain_changed after insert or update or delete on public.seller_applications for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.stores for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.listings for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.listing_media for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.listing_price_options for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.store_subscriptions for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.store_fee_periods for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.market_orders for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.market_messages for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on public.market_reviews for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on private.payment_checkouts for each row execute function private.residence_review_changed();
create trigger wipe_review_domain_changed after insert or update or delete on private.residence_room_key_cycles for each row execute function private.residence_review_changed();

create function private.system_wipe_row_digests(source regclass,ids uuid[],id_column text default 'id') returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',t.%I,''digest'',encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'')) order by t.%I),''[]''::jsonb) from %s t where t.%I=any($1)',id_column,id_column,source,id_column) into result using ids;
 return result;
end;
$$;
create function private.system_wipe_preview(scopes jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare scope_contexts uuid[]:='{}';scope_homes uuid[]:='{}';scope_stores uuid[]:='{}';scope_roots uuid[]:='{}';scope_blocks uuid[];scope_floors uuid[];scope_rooms uuid[];
 scope_listings uuid[];scope_orders uuid[];scope_cases uuid[];scope_issues uuid[];scope_payments uuid[];scope_subjects uuid[];size_before integer;resources jsonb:='{}';data jsonb:='{}';ids uuid[];entry record;
begin
 if not coalesce(private.valid_system_wipe_scopes(scopes),false) then raise exception using errcode='22023',message='Valid distinct system wipe scopes required';end if;
 select coalesce(array_agg(c.id order by c.id),'{}') into scope_contexts from public.account_contexts c
 where c.kind<>'admin' and c.status<>'closed' and (scopes ? 'total' or scopes ? 'users' and c.kind='primary' or scopes ? 'managers' and c.kind='manager' or scopes ? 'residents' and c.kind='resident');
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
 select coalesce(array_agg(id order by id),'{}') into ids from public.meetings where residence_id=any(scope_homes) or participant_context_id=any(scope_contexts);
 resources:=resources||jsonb_build_object('meetings',to_jsonb(ids));data:=data||jsonb_build_object('meetings',private.system_wipe_row_digests('public.meetings'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from public.staff_bargains where staff_assignment_id in(select id from public.staff_assignments where residence_id=any(scope_homes) or staff_context_id=any(scope_contexts) or created_by_manager_id=any(scope_contexts));
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
 select coalesce(array_agg(id order by id),'{}') into ids from public.media_assets where owner_context_id=any(scope_contexts) or residence_id=any(scope_homes) or issue_id=any(scope_issues) or allocation_id in(select id from public.allocations where room_id=any(scope_rooms) or resident_context_id=any(scope_contexts)) or inspection_id in(select id from public.verification_inspections where case_id=any(scope_cases));
 resources:=resources||jsonb_build_object('media_assets',to_jsonb(ids));data:=data||jsonb_build_object('media_assets',private.system_wipe_row_digests('public.media_assets'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from private.room_activation_keys where room_id=any(scope_rooms);
 resources:=resources||jsonb_build_object('room_activation_keys',to_jsonb(ids));data:=data||jsonb_build_object('room_activation_keys',private.system_wipe_row_digests('private.room_activation_keys'::regclass,ids));
 select coalesce(array_agg(id order by id),'{}') into ids from private.residence_room_key_cycles where residence_id=any(scope_homes);
 resources:=resources||jsonb_build_object('residence_room_key_cycles',to_jsonb(ids));data:=data||jsonb_build_object('residence_room_key_cycles',private.system_wipe_row_digests('private.residence_room_key_cycles'::regclass,ids));

 -- Session tokens and credential hashes never enter a preview.
 data:=data||jsonb_build_object('account_bindings',(select coalesce(jsonb_agg(jsonb_build_object('contextId',active_context_id,'digest',encode(sha256(convert_to(to_jsonb(binding)::text,'UTF8')),'hex')) order by session_id),'[]') from private.account_sessions binding where active_context_id=any(scope_contexts)));
 data:=data||jsonb_build_object('manager_keys',(select coalesce(jsonb_agg(jsonb_build_object('contextId',manager_context_id,'version',version,'issued',issued_at)order by manager_context_id),'[]') from private.manager_operation_keys where manager_context_id=any(scope_contexts)));
 data:=data||jsonb_build_object('pending_enrollments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'status',status,'contextId',linked_context_id,'roomId',room_id,'residenceId',residence_id,'expires',expires_at)order by id),'[]') from private.account_enrollments where initiator_context_id=any(scope_contexts) or linked_context_id=any(scope_contexts) or residence_id=any(scope_homes) or room_id=any(scope_rooms)));
 data:=data||jsonb_build_object('payment_checkouts',(select coalesce(jsonb_agg(jsonb_build_object('paymentId',payment_id,'digest',encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')) order by payment_id),'[]') from private.payment_checkouts e where payment_id=any(scope_payments)));
 if(select sum(jsonb_array_length(value))from jsonb_each(data))>50000 then raise exception using errcode='54000',message='Scope requires an operator-reviewed bulk plan';end if;
 return jsonb_build_object('version',1,'resourceRevision',(select revision from private.residence_review_state where singleton),'scopes',scopes,'resources',resources,'rowDigests',data,'roster',private.recovery_roster(),
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
create function private.system_wipe_digest(preview jsonb,roster_revision bigint) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('preview',preview,'rosterRevision',roster_revision)::text,'UTF8')),'hex');
$$;
create function private.system_wipe_current(p public.admin_proposals) returns boolean language plpgsql stable set search_path='' as $$
begin
 if p.kind<>'system_wipe' or p.expires_at<=clock_timestamp() or p.wipe_roster_revision is distinct from(select roster_revision from private.admin_pricing_state where singleton)
  or p.wipe_resource_revision is distinct from(select revision from private.residence_review_state where singleton) then return false;end if;
 return jsonb_array_length(p.preview->'roster')=5 and p.preview=private.system_wipe_preview(p.preview->'scopes') and p.baseline_digest=private.system_wipe_digest(p.preview,p.wipe_roster_revision);
end;
$$;
create function private.system_wipe_quorum(proposal uuid) returns boolean language sql stable set search_path='' as $$
 select count(*)=5 and coalesce(bool_and(v.decision='approved' and exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=v.administrator_context_id::text)),false)
 from public.admin_votes v join public.admin_proposals p on p.id=v.proposal_id where p.id=proposal and p.kind='system_wipe' and p.quorum=5;
$$;
create function private.system_wipe_proposal_guard() returns trigger language plpgsql set search_path='' as $$
declare actor uuid:=private.approval_authorized_context();roster_revision bigint;resource_revision bigint;
begin
 if tg_op='DELETE' then if old.kind='system_wipe' then raise exception using errcode='42501',message='System wipe review history is immutable';end if;return old;end if;
 if tg_op='UPDATE' and new.kind is distinct from old.kind and(old.kind='system_wipe' or new.kind='system_wipe') then raise exception using errcode='42501',message='System wipe review kind is immutable';end if;
 if new.kind<>'system_wipe' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 select s.roster_revision into roster_revision from private.admin_pricing_state s where singleton;
 select revision into resource_revision from private.residence_review_state where singleton;
 if tg_op='INSERT' then
  if actor is null or actor is distinct from new.proposer_context_id or new.target_context_id is not null or new.target_residence_id is not null
   or new.status<>'pending' or new.quorum<>5 or new.wipe_roster_revision is distinct from roster_revision or new.wipe_resource_revision is distinct from resource_revision
   or not coalesce(private.valid_system_wipe_scopes(new.preview->'scopes'),false)
   or new.preview is distinct from private.system_wipe_preview(new.preview->'scopes') or jsonb_array_length(new.preview->'roster')<>5
   or not exists(select 1 from jsonb_array_elements(new.preview->'roster') r where r->>'slot'='1')
   or new.baseline_digest is distinct from private.system_wipe_digest(new.preview,roster_revision)
   or jsonb_array_length(new.preview->'accounts')+jsonb_array_length(new.preview->'residences')+jsonb_array_length(new.preview->'stores')=0
   or length(btrim(new.reason)) not between 3 and 500 or new.decided_at is not null or new.executed_at is not null or new.executed_by_context_id is not null
   or new.wipe_final_decision is not null or new.wipe_founder_context_id is not null or new.wipe_final_reason is not null or new.wipe_final_decided_at is not null then
   raise exception using errcode='42501',message='Five keyed administrators and an exact nonempty native wipe review required';end if;
  if exists(select 1 from public.admin_proposals where kind='system_wipe' and status in('pending','approved') and preview->'scopes'=new.preview->'scopes') then raise exception using errcode='23505',message='This wipe scope is already under review';end if;
  if(select count(*)from public.admin_proposals where kind='system_wipe' and status in('pending','approved'))>=10 then raise exception using errcode='54000',message='Too many active wipe reviews';end if;
  new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval'24 hours';
 else
  if to_jsonb(new)-array['status','decided_at','wipe_final_decision','wipe_founder_context_id','wipe_final_reason','wipe_final_decided_at']
   is distinct from to_jsonb(old)-array['status','decided_at','wipe_final_decision','wipe_founder_context_id','wipe_final_reason','wipe_final_decided_at'] then raise exception using errcode='42501',message='Saved wipe scope and execution metadata are immutable';end if;
  if new.status is distinct from old.status then
   if old.status not in('pending','approved') then raise exception using errcode='42501',message='Wipe review is final';end if;
   if new.status='expired' and old.expires_at<=clock_timestamp() then null;
   elsif new.status='invalidated' and not private.system_wipe_current(old) then null;
   elsif new.status='approved' and old.status='pending' and actor is not null and private.system_wipe_current(old) and private.system_wipe_quorum(old.id) then null;
   elsif new.status='rejected' and actor is not null and private.system_wipe_current(old) and(old.status='pending' and exists(select 1 from public.admin_votes where proposal_id=old.id and administrator_context_id=actor and decision='rejected')
    or old.status='approved' and private.system_wipe_quorum(old.id) and new.wipe_final_decision='reject' and old.wipe_final_decision is null
     and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')) then null;
   else raise exception using errcode='42501',message='Wipe execution remains disabled; current independent consent required';end if;
   new.decided_at:=clock_timestamp();
  elsif new.decided_at is distinct from old.decided_at then raise exception using errcode='42501',message='Decision time is server controlled';end if;
  if(new.wipe_final_decision,new.wipe_founder_context_id,new.wipe_final_reason,new.wipe_final_decided_at) is distinct from(old.wipe_final_decision,old.wipe_founder_context_id,old.wipe_final_reason,old.wipe_final_decided_at) then
   if old.status<>'approved' or old.wipe_final_decision is not null or actor is null or not private.system_wipe_current(old) or not private.system_wipe_quorum(old.id)
    or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
    or new.wipe_final_decision is null or new.wipe_final_reason is null or new.wipe_final_decision not in('approve-backup','reject') or length(btrim(new.wipe_final_reason)) not between 3 and 500
    or new.wipe_final_decision='reject' and new.status<>'rejected' or new.wipe_final_decision='approve-backup' and new.status<>'approved' then
    raise exception using errcode='42501',message='Current keyed founder final review required';end if;
   new.wipe_founder_context_id:=actor;new.wipe_final_decided_at:=clock_timestamp();
  end if;
 end if;return new;
end;
$$;
create trigger system_wipe_proposal_guard before insert or update or delete on public.admin_proposals for each row execute function private.system_wipe_proposal_guard();
create function private.system_wipe_vote_guard() returns trigger language plpgsql set search_path='' as $$
declare p public.admin_proposals;actor uuid:=private.approval_authorized_context();
begin
 if tg_op='UPDATE' and exists(select 1 from public.admin_proposals where id=old.proposal_id and kind='system_wipe') then raise exception using errcode='42501',message='Wipe votes are immutable';end if;
 select * into p from public.admin_proposals where id=case when tg_op='DELETE' then old.proposal_id else new.proposal_id end for update;
 if p.kind is distinct from 'system_wipe' then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op<>'INSERT' or actor is null or new.administrator_context_id is distinct from actor or p.status<>'pending' or not private.system_wipe_current(p)
  or not exists(select 1 from jsonb_array_elements(p.preview->'roster')r where r->>'id'=actor::text)
  or exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=actor)
  or actor=p.proposer_context_id and new.decision<>'approved'
  or actor<>p.proposer_context_id and not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=p.proposer_context_id and decision='approved') then
  raise exception using errcode='42501',message='One current own-key vote per administrator required';end if;
 new.decided_at:=clock_timestamp();return new;
end;
$$;
create trigger system_wipe_vote_guard before insert or update or delete on public.admin_votes for each row execute function private.system_wipe_vote_guard();
create function private.system_wipe_vote_recorded() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.admin_proposals where id=new.proposal_id and kind='system_wipe') then
  if new.decision='rejected' then update public.admin_proposals set status='rejected' where id=new.proposal_id;
  elsif private.system_wipe_quorum(new.proposal_id) then update public.admin_proposals set status='approved' where id=new.proposal_id;end if;
 end if;return new;
end;
$$;
create trigger system_wipe_vote_recorded after insert on public.admin_votes for each row execute function private.system_wipe_vote_recorded();
revoke all on function private.valid_system_wipe_scopes(jsonb),private.system_wipe_row_digests(regclass,uuid[],text),private.system_wipe_preview(jsonb),private.system_wipe_digest(jsonb,bigint),private.system_wipe_current(public.admin_proposals),private.system_wipe_quorum(uuid),private.system_wipe_proposal_guard(),private.system_wipe_vote_guard(),private.system_wipe_vote_recorded() from public,anon,authenticated,pinevela_backend;
