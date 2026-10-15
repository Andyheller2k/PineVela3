-- Annual resets retain Auth/allocation history and have one immutable receipt per year.
-- residence_id deliberately retains the historical UUID after reviewed physical deletion.
create table private.residence_room_key_cycles (
 id uuid primary key default gen_random_uuid(),
 residence_id uuid not null,
 residence_name text not null,
 academic_year text not null check(academic_year ~ '^[0-9]{4}/[0-9]{4}$' and substring(academic_year,6,4)::integer=substring(academic_year,1,4)::integer+1),
 actor_context_id uuid not null references public.account_contexts(id),
 actor_kind text not null check(actor_kind in('manager','admin')),
 manager_key_version bigint,
 approval_key_version uuid,
 check(actor_kind='manager' and manager_key_version is not null and manager_key_version>0 and approval_key_version is null or actor_kind='admin' and manager_key_version is null and approval_key_version is not null),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 room_count integer not null check(room_count between 1 and 10000),
 occupants_removed integer not null check(occupants_removed between 0 and room_count),
 completed_at timestamptz not null default transaction_timestamp(),
 unique(residence_id,academic_year)
);
alter table private.residence_room_key_cycles enable row level security;
revoke all on private.residence_room_key_cycles from public,anon,authenticated,pinevela_backend;
create index residence_room_key_cycles_latest on private.residence_room_key_cycles(residence_id,academic_year desc);
alter table private.room_activation_keys add column cycle_id uuid references private.residence_room_key_cycles(id);
create index room_activation_keys_cycle on private.room_activation_keys(cycle_id) where cycle_id is not null;
create function private.guard_room_key_cycle() returns trigger language plpgsql set search_path='' as $$
declare actor uuid:=private.current_context_id();kind text:=private.current_kind();
begin
 if tg_op<>'INSERT' then raise exception using errcode='42501',message='Annual room-key receipts are immutable';end if;
 if new.actor_context_id is distinct from actor or new.actor_kind is distinct from kind
  or current_setting('pinevela.room_cycle_confirmation',true) is distinct from 'RESET ROOM ACCESS'
  or not exists(select 1 from public.residences r where r.id=new.residence_id and r.status='approved' and r.name=new.residence_name and private.residence_has_reviewed_setup(r.id))
  or exists(select 1 from private.residence_room_key_cycles previous_cycle where previous_cycle.residence_id=new.residence_id and previous_cycle.academic_year>=new.academic_year)
  or not private.account_feature_allowed(actor,'rooms') then
  raise exception using errcode='42501',message='Current approved housing and explicit annual reset consent required';end if;
 if kind='manager' then
  if not exists(select 1 from public.manager_assignments a join private.manager_operation_keys k on k.manager_context_id=a.manager_context_id
   where a.residence_id=new.residence_id and a.manager_context_id=actor and a.ended_at is null and k.key_hash is not null
    and k.version=new.manager_key_version and k.version::text=current_setting('pinevela.room_cycle_key_version',true) and (k.locked_until is null or k.locked_until<=clock_timestamp())) then
   raise exception using errcode='42501',message='Assigned manager own-key grant required';end if;
 elsif kind='admin' then
  if not exists(select 1 from public.admin_memberships m join private.admin_secrets s on s.context_id=m.context_id
   where m.context_id=actor and m.status='active' and s.approval_key_hash is not null and s.approval_key_version=new.approval_key_version
    and s.approval_key_version::text=current_setting('pinevela.approval_key_version',true) and (s.locked_until is null or s.locked_until<=clock_timestamp())) then
   raise exception using errcode='42501',message='Administrator own-approval-key grant required';end if;
 else raise exception using errcode='42501',message='Authorized housing actor required';end if;
 if new.room_count<>(select count(*) from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id where b.residence_id=new.residence_id)
  or new.occupants_removed<>(select count(*) from public.allocations a join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id where b.residence_id=new.residence_id and a.ended_at is null) then
  raise exception using errcode='42501',message='Exact current annual-reset counts required';end if;
 if new.completed_at<>transaction_timestamp() then raise exception using errcode='42501',message='Current receipt timestamp required';end if;
 return new;
end;
$$;
create trigger room_key_cycle_guard before insert or update or delete on private.residence_room_key_cycles for each row execute function private.guard_room_key_cycle();
create trigger room_key_cycle_truncate_guard before truncate on private.residence_room_key_cycles for each statement execute function private.guard_room_key_cycle();
-- Existing freeze guard uses the saved residence_id to protect the new receipt too.
create trigger aaa_residence_freeze_writer_lock before insert or update or delete on private.residence_room_key_cycles for each row execute function private.residence_freeze_writer_lock();
create trigger aab_residence_freeze_write_guard before insert or update or delete on private.residence_room_key_cycles for each row execute function private.residence_freeze_write_guard();
create trigger residence_freeze_truncate_guard before truncate on private.residence_room_key_cycles for each statement execute function private.residence_freeze_truncate_guard();
create function private.guard_activation_key_cycle() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.cycle_id is distinct from old.cycle_id then raise exception using errcode='42501',message='Room-key cycle identity is immutable';end if;
 if new.cycle_id is not null and not exists(select 1 from private.residence_room_key_cycles c join public.blocks b on b.residence_id=c.residence_id
  join public.floors f on f.block_id=b.id join public.rooms r on r.floor_id=f.id where c.id=new.cycle_id and r.id=new.room_id) then
  raise exception using errcode='42501',message='Room key must belong to the saved residence cycle';end if;
 return new;
end;
$$;
create trigger activation_key_cycle_guard before insert or update on private.room_activation_keys for each row execute function private.guard_activation_key_cycle();
revoke all on function private.guard_room_key_cycle(),private.guard_activation_key_cycle() from public,anon,authenticated,pinevela_backend;

create function private.check_room_key_cycle_completion() returns trigger language plpgsql set search_path='' as $$
begin
 if (select count(*) from private.room_activation_keys k where k.cycle_id=new.id and k.revoked_at is null and k.claimed_by is null)<>new.room_count
  or exists(select 1 from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
   where b.residence_id=new.residence_id and (not exists(select 1 from private.room_activation_keys k where k.room_id=r.id and k.cycle_id=new.id and k.revoked_at is null and k.claimed_by is null)
    or exists(select 1 from public.allocations a where a.room_id=r.id and a.ended_at is null))) then
  raise exception using errcode='42501',message='Annual reset must complete atomically for every saved residence room';end if;
 return new;
end;
$$;
create constraint trigger room_key_cycle_complete after insert on private.residence_room_key_cycles deferrable initially deferred for each row execute function private.check_room_key_cycle_completion();
revoke all on function private.check_room_key_cycle_completion() from public,anon,authenticated,pinevela_backend;
