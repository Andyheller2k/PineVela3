-- Immutable cleanup planning only. No object, residence or account deletion.
create function private.residence_cleanup_candidates(scope jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare a public.media_assets;entry record;shared boolean;found_ref boolean;decision text;why text;
 items jsonb:='[]'::jsonb;scope_tables text[]:=array['residences','manager_assignments','blocks','floors','rooms','beds','allocations',
 'staff_assignments','verification_cases','verification_inspections','residence_change_requests','maintenance_issues',
 'maintenance_events','repair_reviews','staff_reviews','meetings','staff_bargains'];
begin
 if scope is null then raise exception using errcode='42501',message='A saved reviewed residence scope is required';end if;
 for a in select * from public.media_assets where coalesce(scope->'media_assets','[]'::jsonb) ? id::text order by id loop
  decision:='retain';why:='retained-purpose';
  if a.purpose in('hostel','inspection','maintenance','repair') then
   why:='outside-housing-scope';
   if (a.residence_id is null or coalesce(scope->'residences','[]'::jsonb) ? a.residence_id::text)
    and (a.inspection_id is null or coalesce(scope->'verification_inspections','[]'::jsonb) ? a.inspection_id::text)
    and (a.issue_id is null or coalesce(scope->'maintenance_issues','[]'::jsonb) ? a.issue_id::text)
    and (a.allocation_id is null or coalesce(scope->'allocations','[]'::jsonb) ? a.allocation_id::text) then
    if a.state<>'ready' then why:='not-ready';
    else
     shared:=false;
     -- Retained profiles, portals, marketplace rows and unknown future tables
     -- always count as outside scope. Only actual removable housing rows are ignored.
     for entry in select schemaname,tablename from pg_catalog.pg_tables where schemaname in('public','private') and not(schemaname='public' and tablename='media_assets') order by schemaname,tablename loop
      execute format('select exists(select 1 from %I.%I t where strpos(to_jsonb(t)::text,$1)>0 and not($2 and coalesce($3,''[]''::jsonb) ? coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''issue_id'',to_jsonb(t)->>''context_id'','''')))',entry.schemaname,entry.tablename)
       into found_ref using '/api/media/'||a.id::text,entry.schemaname='public' and entry.tablename=any(scope_tables),scope->entry.tablename;
      if found_ref then shared:=true;exit;end if;
     end loop;
     if shared then why:='shared-reference';else decision:='remove';why:='exclusive-housing';end if;
    end if;
   end if;
  end if;
  items:=items||jsonb_build_array(jsonb_build_object('assetId',a.id,'ownerContextId',a.owner_context_id,
   'bucket',a.bucket_id,'path',a.object_path,'bytes',a.byte_size,'sha256',a.sha256,'purpose',a.purpose,'state',a.state,'decision',decision,'reason',why));
 end loop;
 return jsonb_build_object('version',1,'items',items,
  'removeCount',(select count(*) from jsonb_array_elements(items) x where x->>'decision'='remove'),
  'retainCount',(select count(*) from jsonb_array_elements(items) x where x->>'decision'='retain'),
  'removeBytes',(select coalesce(sum((x->>'bytes')::bigint),0) from jsonb_array_elements(items) x where x->>'decision'='remove'));
end;
$$;
create function private.residence_cleanup_preview(preparation uuid) returns jsonb
language sql stable set search_path='' as $$
 select private.residence_cleanup_candidates((select p.preview->'resources'
 from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id where f.id=preparation))
 ||jsonb_build_object('preparationId',preparation);
$$;
create table private.residence_cleanup_plans (
 preparation_id uuid primary key references private.residence_recovery_evidence(preparation_id),
 native_catalog_digest text not null check(native_catalog_digest ~ '^[a-f0-9]{64}$'),
 plan jsonb not null,
 plan_digest text not null check(plan_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.residence_cleanup_plans enable row level security;
revoke all on private.residence_cleanup_plans from public,anon,authenticated,pinevela_backend;
create function private.residence_cleanup_plan_guard() returns trigger
language plpgsql set search_path='' as $$
declare f private.residence_deletion_preparations;p public.admin_proposals;r private.residence_recovery_evidence;live jsonb;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Residence cleanup plans are immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='42501',message='Cleanup planning requires READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 select * into f from private.residence_deletion_preparations where id=new.preparation_id for update;
 select * into p from public.admin_proposals where id=f.proposal_id for update;
 select * into r from private.residence_recovery_evidence where preparation_id=f.id;
 live:=private.residence_cleanup_preview(f.id);
 if f.state is distinct from 'frozen' or p.status is distinct from 'approved' or not private.residence_review_current(p)
  or not private.residence_review_quorum(p.id) or r.preparation_id is null
  or not exists(select 1 from public.admin_memberships where context_id=f.founder_context_id and slot=1 and status='active')
  or not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=f.founder_context_id and decision='approved')
  or new.native_catalog_digest is distinct from r.native_catalog_digest
  or new.native_catalog_digest is distinct from private.residence_recovery_catalog_digest()
  or new.plan is distinct from live or new.plan_digest is distinct from encode(sha256(convert_to(live::text,'UTF8')),'hex')
  or current_setting('pinevela.residence_cleanup_checked',true) is distinct from (to_jsonb(new)-'created_at')::text then
  raise exception using errcode='42501',message='Current frozen consent, actual recovery evidence and exact cleanup plan are required';end if;
 new.created_at:=clock_timestamp();return new;
end;
$$;
create trigger residence_cleanup_plan_guard before insert or update or delete on private.residence_cleanup_plans
 for each row execute function private.residence_cleanup_plan_guard();
create trigger residence_cleanup_plan_truncate_guard before truncate on private.residence_cleanup_plans
 for each statement execute function private.residence_cleanup_plan_guard();
revoke all on function private.residence_cleanup_candidates(jsonb),private.residence_cleanup_preview(uuid),private.residence_cleanup_plan_guard() from public,anon,authenticated,pinevela_backend;
