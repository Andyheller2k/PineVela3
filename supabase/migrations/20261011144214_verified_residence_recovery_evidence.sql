-- Recovery evidence only. Operational deletion, cooldowns and Storage cleanup remain disabled.
create table private.residence_recovery_evidence (
 preparation_id uuid primary key references private.residence_deletion_preparations(id),
 checkpoint_id uuid not null,
 storage_archive_id uuid not null,
 project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$'),
 dump_sha256 text not null check(dump_sha256 ~ '^[a-f0-9]{64}$'),
 storage_inventory_digest text not null check(storage_inventory_digest ~ '^[a-f0-9]{64}$'),
 native_catalog_digest text not null check(native_catalog_digest ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 scope_digest text not null check(scope_digest ~ '^[a-f0-9]{64}$'),
 preparation_created_at timestamptz not null,
 checkpoint_created_at timestamptz not null,
 objects integer not null check(objects between 0 and 10000),
 bytes bigint not null check(bytes between 0 and 4294967296),
 verified_at timestamptz not null default clock_timestamp()
);
alter table private.residence_recovery_evidence enable row level security;
revoke all on private.residence_recovery_evidence from public,anon,authenticated,pinevela_backend;

-- This separate digest uses native jsonb text, while the encrypted archive keeps
-- its own canonical digest. The trusted worker verifies both against the actual
-- restored PostgreSQL catalog; SQL cannot establish filesystem restore success.
create function private.residence_recovery_catalog_digest() returns text
language sql stable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'buckets',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from (select * from storage.buckets order by id limit 501) t),
 'objects',(select coalesce(jsonb_agg(to_jsonb(t) order by bucket_id,name,id),'[]'::jsonb) from (select * from storage.objects order by bucket_id,name,id limit 10001) t),
 'assets',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from (select * from public.media_assets order by id limit 10001) t),
 'multipartUploads',(select count(*) from storage.s3_multipart_uploads))::text,'UTF8')),'hex');
$$;
create function private.residence_recovery_guard() returns trigger
language plpgsql set search_path='' as $$
declare f private.residence_deletion_preparations;p public.admin_proposals;proof jsonb;
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Residence recovery evidence is immutable';end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Housing recovery writes require READ COMMITTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0));
 perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
 select * into f from private.residence_deletion_preparations where id=new.preparation_id for update;
 select * into p from public.admin_proposals where id=f.proposal_id for update;
 proof:=to_jsonb(new)-'verified_at';
 if f.id is null or f.state is distinct from 'frozen' or p.kind is distinct from 'residence_deletion'
  or p.status is distinct from 'approved' or not private.residence_review_current(p) or not private.residence_review_quorum(p.id)
  or not exists(select 1 from public.admin_memberships where context_id=f.founder_context_id and slot=1 and status='active')
  or not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=f.founder_context_id and decision='approved')
  or new.scope_digest is distinct from f.preview_digest or new.scope_digest is distinct from p.baseline_digest
  or new.preparation_created_at is distinct from f.created_at
  or new.checkpoint_created_at<f.created_at or new.checkpoint_created_at>clock_timestamp()
  or new.native_catalog_digest is distinct from private.residence_recovery_catalog_digest()
  or current_setting('pinevela.residence_recovery_checked',true) is distinct from proof::text then
  raise exception using errcode='42501',message='Current paused housing consent and verified recovery evidence are required';end if;
 new.verified_at:=clock_timestamp();return new;
end;
$$;
create trigger residence_recovery_guard before insert or update or delete on private.residence_recovery_evidence
 for each row execute function private.residence_recovery_guard();
create trigger residence_recovery_truncate_guard before truncate on private.residence_recovery_evidence
 for each statement execute function private.residence_recovery_guard();

-- A repeatable-read writer could otherwise retain a snapshot predating a freeze.
-- Application transactions explicitly use READ COMMITTED; reject other domain writers.
create or replace function private.residence_freeze_writer_lock() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Housing writes require READ COMMITTED';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0));
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create function private.residence_preparation_isolation_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Housing preparation writes require READ COMMITTED';end if;
 return null;
end;
$$;
create trigger aaa_residence_preparation_isolation_guard before insert or update or delete on private.residence_deletion_preparations
 for each statement execute function private.residence_preparation_isolation_guard();
revoke all on function private.residence_recovery_catalog_digest(),private.residence_recovery_guard(),
 private.residence_freeze_writer_lock(),private.residence_preparation_isolation_guard() from public,anon,authenticated,pinevela_backend;
