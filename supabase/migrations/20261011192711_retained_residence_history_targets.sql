-- Retain real residence identity for financial and governance history.
-- No deletion worker is enabled by this migration.
create table private.residence_history_targets (
 residence_id uuid primary key,
 original_primary_owner_id uuid not null,
 original_name text not null check(length(btrim(original_name)) between 1 and 200),
 original_registered_at timestamptz not null,
 captured_at timestamptz not null default clock_timestamp()
);
alter table private.residence_history_targets enable row level security;
revoke all on private.residence_history_targets from public,anon,authenticated,pinevela_backend;

create function private.residence_history_target_guard() returns trigger
language plpgsql set search_path='' as $$
declare r public.residences;
begin
 if tg_op<>'INSERT' then
  raise exception using errcode='42501',message='Residence target history is immutable';end if;
 select * into r from public.residences where id=new.residence_id for key share;
 if r.id is null or new.original_primary_owner_id is distinct from r.primary_owner_id
  or new.original_name is distinct from r.name or new.original_registered_at is distinct from r.registered_at then
  raise exception using errcode='42501',message='An actual saved residence and exact original metadata are required';end if;
 new.captured_at:=clock_timestamp();return new;
end;
$$;
create trigger residence_history_target_guard before insert or update or delete on private.residence_history_targets
 for each row execute function private.residence_history_target_guard();
create trigger residence_history_target_truncate_guard before truncate on private.residence_history_targets
 for each statement execute function private.residence_history_target_guard();

insert into private.residence_history_targets(residence_id,original_primary_owner_id,original_name,original_registered_at)
 select id,primary_owner_id,name,registered_at from public.residences;

create function private.capture_residence_history_target() returns trigger
language plpgsql set search_path='' as $$
begin
 insert into private.residence_history_targets(residence_id,original_primary_owner_id,original_name,original_registered_at)
  values(new.id,new.primary_owner_id,new.name,new.registered_at);
 return null;
end;
$$;
create trigger "AA_capture_residence_history_target" after insert on public.residences
 for each row execute function private.capture_residence_history_target();
alter table public.residences add constraint residences_history_target_fkey
 foreign key(id) references private.residence_history_targets(residence_id) deferrable initially deferred;
alter table private.residence_payment_references add constraint residence_payment_history_target_fkey
 foreign key(residence_id) references private.residence_history_targets(residence_id);

-- Replacing operational FKs must not open an unreviewed DELETE/TRUNCATE route.
-- The later worker must explicitly replace this guard with its scoped native protocol.
create function private.residence_history_identity_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op in('DELETE','TRUNCATE') then
  raise exception using errcode='42501',message='Verified residence deletion worker is not enabled';end if;
 if tg_op='UPDATE' then
  if new.id is distinct from old.id then
   raise exception using errcode='42501',message='Residence identity is immutable';end if;
 elsif exists(select 1 from private.residence_history_targets where residence_id=new.id) then
  raise exception using errcode='23505',message='A historical residence identity cannot be reused';end if;
 return new;
end;
$$;
create trigger aac_residence_history_identity_guard before insert or update or delete on public.residences
 for each row execute function private.residence_history_identity_guard();
create trigger residence_history_truncate_guard before truncate on public.residences
 for each statement execute function private.residence_history_identity_guard();

create function private.residence_proposal_live_target_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.target_residence_id is not null and (tg_op='INSERT' or new.target_residence_id is distinct from old.target_residence_id) then
  perform id from public.residences where id=new.target_residence_id for key share;
  if not found then
   raise exception using errcode='42501',message='A new review requires an actual live residence';end if;
 end if;
 return new;
end;
$$;
create trigger residence_proposal_live_target_guard before insert or update of target_residence_id on public.admin_proposals
 for each row execute function private.residence_proposal_live_target_guard();

-- Existing native capture/immutability guards still require a real live target
-- for new quotes; historical references are never an ownership/access credential.
alter table public.payments drop constraint payments_residence_id_fkey;
alter table public.admin_proposals drop constraint admin_proposals_target_residence_id_fkey;
alter table public.admin_proposals add constraint admin_proposals_residence_history_target_fkey
 foreign key(target_residence_id) references private.residence_history_targets(residence_id);
revoke all on function private.residence_history_target_guard(),private.capture_residence_history_target(),
 private.residence_history_identity_guard(),private.residence_proposal_live_target_guard()
 from public,anon,authenticated,pinevela_backend;
