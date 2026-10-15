-- Preserve genuine receipt target metadata before enabling operational residence removal.
-- The existing public.residences foreign key remains: this migration enables no deletion.
create table private.residence_payment_references (
 residence_id uuid primary key,
 source_payment_id uuid not null unique references public.payments(id),
 original_name text not null check(length(btrim(original_name)) between 1 and 200),
 original_primary_owner_id uuid not null,
 captured_at timestamptz not null default clock_timestamp()
);
alter table private.residence_payment_references enable row level security;
revoke all on private.residence_payment_references from public,anon,authenticated,pinevela_backend;

create function private.residence_payment_reference_guard() returns trigger
language plpgsql set search_path='' as $$
declare p public.payments;r public.residences;
begin
 if tg_op<>'INSERT' then
  raise exception using errcode='42501',message='Residence payment references are immutable';end if;
 select * into p from public.payments where id=new.source_payment_id for share;
 select * into r from public.residences where id=new.residence_id for share;
 if p.id is null or r.id is null or p.residence_id is distinct from r.id
  or p.store_id is not null or p.purpose is distinct from 'residence_onboarding'
  or new.original_name is distinct from r.name or new.original_primary_owner_id is distinct from r.primary_owner_id then
  raise exception using errcode='42501',message='An actual residence payment and exact saved target are required';end if;
 new.captured_at:=clock_timestamp();return new;
end;
$$;
create trigger residence_payment_reference_guard before insert or update or delete on private.residence_payment_references
 for each row execute function private.residence_payment_reference_guard();
create trigger residence_payment_reference_truncate_guard before truncate on private.residence_payment_references
 for each statement execute function private.residence_payment_reference_guard();

-- Backfill only real existing relationships. No test identities or quotes are imported.
insert into private.residence_payment_references(residence_id,source_payment_id,original_name,original_primary_owner_id)
 select distinct on(p.residence_id) p.residence_id,p.id,r.name,r.primary_owner_id
 from public.payments p join public.residences r on r.id=p.residence_id
 where p.residence_id is not null order by p.residence_id,p.created_at,p.id;

create function private.capture_residence_payment_reference() returns trigger
language plpgsql set search_path='' as $$
declare r public.residences;
begin
 if new.residence_id is null then return null;end if;
 select * into r from public.residences where id=new.residence_id for share;
 if r.id is null then raise exception using errcode='23514',message='A live saved residence is required for a new payment';end if;
 insert into private.residence_payment_references(residence_id,source_payment_id,original_name,original_primary_owner_id)
  values(r.id,new.id,r.name,r.primary_owner_id) on conflict(residence_id) do nothing;
 return null;
end;
$$;
-- Run before the RI constraint triggers, including an immediate retention FK. Existing checkout constraints remain deferred.
create trigger "AA_capture_residence_payment_reference" after insert on public.payments
 for each row execute function private.capture_residence_payment_reference();
alter table public.payments add constraint payments_residence_retention_fkey
 foreign key(residence_id) references private.residence_payment_references(residence_id)
 deferrable initially deferred;
revoke all on function private.residence_payment_reference_guard(),private.capture_residence_payment_reference()
 from public,anon,authenticated,pinevela_backend;
