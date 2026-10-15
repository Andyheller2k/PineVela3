-- Non-destructive preparation/evidence only. No writer freeze or wipe execution.
create table private.system_wipe_preparations(
 id uuid primary key default gen_random_uuid(),
 proposal_id uuid not null unique references public.admin_proposals(id),
 founder_context_id uuid not null references public.admin_memberships(context_id),
 scope_digest text not null check(scope_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'active' check(state in('active','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 cancelled_at timestamptz,cancelled_by uuid references public.admin_memberships(context_id),cancellation_reason text,
 check((state='cancelled')=(cancelled_at is not null)),
 check((state='cancelled')=(cancelled_by is not null)),
 check((state='cancelled')=(cancellation_reason is not null))
);
alter table private.system_wipe_preparations enable row level security;
revoke all on private.system_wipe_preparations from public,anon,authenticated,pinevela_backend;
alter function private.system_wipe_current(public.admin_proposals) rename to system_wipe_current_v58;
create function private.system_wipe_current(p public.admin_proposals)returns boolean
 language sql stable set search_path='' as $$
 select private.system_wipe_current_v58(p) and not exists(select 1 from private.system_wipe_preparations where proposal_id=p.id and state='cancelled');
$$;
create function private.system_wipe_preparation_guard()returns trigger language plpgsql set search_path='' as $$
declare actor uuid;p public.admin_proposals;
begin
 if tg_op in('DELETE','TRUNCATE') then raise exception using errcode='42501',message='Wipe preparation history is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='42501',message='Wipe preparation requires READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 actor:=private.approval_authorized_context();
 if actor is null or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')then
  raise exception using errcode='42501',message='Current own-key founder proof required';end if;
 if tg_op='INSERT' then
  select * into p from public.admin_proposals where id=new.proposal_id for update;
  if p.id is null or p.kind is distinct from 'system_wipe' or p.status is distinct from 'approved'
   or not private.system_wipe_current(p) or not private.system_wipe_quorum(p.id)
   or p.wipe_final_decision is distinct from 'approve-backup' or p.wipe_founder_context_id is distinct from actor
   or new.founder_context_id is distinct from actor or new.scope_digest is distinct from p.baseline_digest
   or new.state is distinct from 'active' or new.cancelled_at is not null or new.cancelled_by is not null or new.cancellation_reason is not null
   or current_setting('pinevela.system_wipe_preparation_confirmation',true)is distinct from 'START WIPE BACKUP' then
   raise exception using errcode='42501',message='Current five-admin and final founder backup consent required';end if;
  if(select count(*)from private.system_wipe_preparations where state='active')>=10 then raise exception using errcode='54000',message='Cancel existing backup preparations before starting another';end if;
  new.created_at:=clock_timestamp();
 else
  if old.state<>'active' or new.state is distinct from 'cancelled' or new.cancellation_reason is null or length(btrim(new.cancellation_reason))not between 3 and 500
   or to_jsonb(new)-array['state','cancelled_at','cancelled_by','cancellation_reason']is distinct from to_jsonb(old)-array['state','cancelled_at','cancelled_by','cancellation_reason']then
   raise exception using errcode='42501',message='Only keyed founder cancellation may update preparation';end if;
  new.cancelled_at:=clock_timestamp();new.cancelled_by:=actor;
 end if;return new;
end;
$$;
create trigger system_wipe_preparation_guard before insert or update or delete on private.system_wipe_preparations for each row execute function private.system_wipe_preparation_guard();
create trigger system_wipe_preparation_truncate_guard before truncate on private.system_wipe_preparations for each statement execute function private.system_wipe_preparation_guard();
create function private.system_wipe_preparation_cancelled()returns trigger language plpgsql set search_path='' as $$
begin
 if old.state='active' and new.state='cancelled' then update public.admin_proposals set status=case when expires_at<=clock_timestamp()then 'expired' else 'invalidated' end where id=new.proposal_id and status in('pending','approved');end if;
 return new;
end;
$$;
create trigger system_wipe_preparation_cancelled after update on private.system_wipe_preparations for each row execute function private.system_wipe_preparation_cancelled();

create table private.system_wipe_recovery_evidence(
 preparation_id uuid primary key references private.system_wipe_preparations(id),
 checkpoint_id uuid not null,storage_archive_id uuid not null,project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$'),
 dump_sha256 text not null check(dump_sha256 ~ '^[a-f0-9]{64}$'),
 storage_inventory_digest text not null check(storage_inventory_digest ~ '^[a-f0-9]{64}$'),
 native_catalog_digest text not null check(native_catalog_digest ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 scope_digest text not null check(scope_digest ~ '^[a-f0-9]{64}$'),
 preparation_created_at timestamptz not null,checkpoint_created_at timestamptz not null,
 objects integer not null check(objects between 0 and 10000),bytes bigint not null check(bytes between 0 and 4294967296),
 verified_at timestamptz not null default clock_timestamp()
);
alter table private.system_wipe_recovery_evidence enable row level security;
revoke all on private.system_wipe_recovery_evidence from public,anon,authenticated,pinevela_backend;
create function private.system_wipe_recovery_guard()returns trigger language plpgsql set search_path='' as $$
declare f private.system_wipe_preparations;p public.admin_proposals;proof jsonb;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Wipe recovery evidence is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='42501',message='Wipe recovery requires READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 select * into f from private.system_wipe_preparations where id=new.preparation_id for update;
 select * into p from public.admin_proposals where id=f.proposal_id for update;
 proof:=to_jsonb(new)-'verified_at';
 if f.id is null or f.state is distinct from 'active' or p.kind is distinct from 'system_wipe' or p.status is distinct from 'approved'
  or not private.system_wipe_current(p) or not private.system_wipe_quorum(p.id)
  or p.wipe_final_decision is distinct from 'approve-backup' or p.wipe_founder_context_id is distinct from f.founder_context_id
  or new.scope_digest is distinct from f.scope_digest or new.scope_digest is distinct from p.baseline_digest
  or new.preparation_created_at is distinct from f.created_at or new.checkpoint_created_at<f.created_at or new.checkpoint_created_at>clock_timestamp()
  or new.native_catalog_digest is distinct from private.residence_recovery_catalog_digest()
  or current_setting('pinevela.system_wipe_recovery_checked',true)is distinct from proof::text then
  raise exception using errcode='42501',message='Current five-admin founder consent and verified recovery files required';end if;
 new.verified_at:=clock_timestamp();return new;
end;
$$;
create trigger system_wipe_recovery_guard before insert or update or delete on private.system_wipe_recovery_evidence for each row execute function private.system_wipe_recovery_guard();
create trigger system_wipe_recovery_truncate_guard before truncate on private.system_wipe_recovery_evidence for each statement execute function private.system_wipe_recovery_guard();
revoke all on function private.system_wipe_current_v58(public.admin_proposals),private.system_wipe_current(public.admin_proposals),private.system_wipe_preparation_guard(),private.system_wipe_preparation_cancelled(),private.system_wipe_recovery_guard() from public,anon,authenticated,pinevela_backend;
