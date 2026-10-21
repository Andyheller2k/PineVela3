-- Server-owned decisions bind moderation to exact normalized pixels/text.
-- No browser, catalog or scoped backend role can create an approval.
create table private.content_safety_checks (
 id uuid primary key, owner_context_id uuid not null references public.account_contexts(id),
 owner_auth_user_id uuid not null references public.profiles(id),
 purpose text not null check(purpose in('market_image','avatar','listing_text','store_text')),
 input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'), policy text not null check(policy='pinevela-nsfw-v1'),
 verdict text not null check(verdict in('approved','blocked','review')), model text not null check(length(model) between 1 and 120),
 provider_request_id text not null check(length(provider_request_id)<=160), sexual_score double precision not null check(sexual_score between 0 and 1),
 categories jsonb not null check(jsonb_typeof(categories)='object' and octet_length(categories::text)<=8000),
 image_path text unique, byte_size integer not null check(byte_size between 0 and 6291456), text_content text,
 ticket_id uuid unique references private.support_tickets(id), created_at timestamptz not null default clock_timestamp(),
 check((purpose in('avatar','market_image') and byte_size>0 and text_content is null) or
       (purpose in('listing_text','store_text') and byte_size=0 and image_path is null and text_content is not null and length(text_content)<=12000)),
 check((verdict='approved' and ticket_id is null and image_path is null) or
       (verdict<>'approved' and ticket_id is not null and (purpose in('listing_text','store_text') or image_path is not null and image_path='contexts/'||owner_context_id::text||'/'||id::text||'.png')))
);
create index content_safety_exact_input on private.content_safety_checks(owner_context_id,purpose,input_sha256,policy,created_at desc,id);
create index content_safety_queue on private.content_safety_checks(created_at desc,id) where verdict<>'approved';
create index content_safety_auth_user on private.content_safety_checks(owner_auth_user_id);
create table private.content_safety_decisions (
 check_id uuid primary key references private.content_safety_checks(id),
 administrator_context_id uuid not null references public.account_contexts(id),
 decision text not null check(decision in('approved','blocked')), reason text not null check(length(reason) between 10 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create index content_safety_decision_author on private.content_safety_decisions(administrator_context_id);
alter table private.content_safety_checks enable row level security;
alter table private.content_safety_decisions enable row level security;
revoke all on private.content_safety_checks,private.content_safety_decisions from public,anon,authenticated,pinevela_catalog,pinevela_backend;
grant select on private.content_safety_checks,private.content_safety_decisions to pinevela_backend;
create policy content_safety_own_or_operator on private.content_safety_checks for select to pinevela_backend
 using(owner_context_id=private.current_context_id() or private.support_operator());
create policy content_safety_decision_operator on private.content_safety_decisions for select to pinevela_backend using(private.support_operator());
create function private.retain_content_safety_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='42501',message='Content safety evidence and decisions are retained';end;$$;
create trigger content_safety_check_history before update or delete on private.content_safety_checks for each row execute function private.retain_content_safety_history();
create trigger content_safety_decision_history before update or delete on private.content_safety_decisions for each row execute function private.retain_content_safety_history();

-- Narrow boolean helpers match the existing private catalog boundary. They do
-- not expose evidence or accept a browser-supplied "safe" flag.
create function private.content_safety_approved(owner uuid,purpose_name text,digest text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(d.decision,m.verdict)='approved' from private.content_safety_checks m
  left join private.content_safety_decisions d on d.check_id=m.id where m.owner_context_id=owner and m.purpose=purpose_name
  and m.input_sha256=digest and m.policy='pinevela-nsfw-v1' order by m.created_at desc,m.id limit 1),false);
$$;
create function private.media_content_approved(asset uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets m where m.id=asset and
  (m.purpose not in('market','avatar') or private.content_safety_approved(m.owner_context_id,case when m.purpose='market' then 'market_image' else 'avatar' end,m.sha256)));
$$;
create function private.listing_text_digest(listing uuid) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(array_to_json(array[l.title,l.description,l.category,coalesce(l.service_category,''),coalesce(l.meeting_location,'')]
  ||array(select o.label from public.listing_price_options o where o.listing_id=l.id order by o.sort_order))::text,'UTF8')),'hex')
 from public.listings l where l.id=listing;
$$;
create function private.store_text_digest(store uuid) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(array_to_json(array[s.name,coalesce(s.username,''),coalesce(s.description,''),coalesce(s.primary_category,''),coalesce(s.location,'')])::text,'UTF8')),'hex')
 from public.stores s where s.id=store;
$$;
create function private.listing_content_approved(listing uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.listings l join public.stores s on s.id=l.store_id where l.id=listing
  and private.content_safety_approved(s.seller_context_id,'listing_text',private.listing_text_digest(l.id))
  and not exists(select 1 from public.listing_media i join public.media_assets m on i.storage_path='/api/media/'||m.id::text where i.listing_id=l.id and not private.media_content_approved(m.id))
  and not exists(select 1 from public.listing_price_options o join public.media_assets m on o.image_path='/api/media/'||m.id::text where o.listing_id=l.id and not private.media_content_approved(m.id)));
$$;

create function private.guard_media_content_safety() returns trigger language plpgsql set search_path='' as $$
begin
 if new.purpose in('market','avatar') and (tg_op='INSERT' or new.state='ready' and new.state is distinct from old.state) and
  not private.content_safety_approved(new.owner_context_id,case when new.purpose='market' then 'market_image' else 'avatar' end,new.sha256) then
  raise exception using errcode='23514',message='Photograph requires an exact approved content check';end if;
 return new;
end;$$;
create trigger media_content_safety before insert or update on public.media_assets for each row execute function private.guard_media_content_safety();
create function private.guard_profile_content_safety() returns trigger language plpgsql set search_path='' as $$
begin
 if new.avatar_asset_id is not null and new.avatar_asset_id is distinct from old.avatar_asset_id and not private.media_content_approved(new.avatar_asset_id) then
  raise exception using errcode='23514',message='Profile picture requires an approved content check';end if;
 return new;
end;$$;
create trigger profile_content_safety before update on public.profiles for each row execute function private.guard_profile_content_safety();
create function private.guard_published_listing_safety() returns trigger language plpgsql security definer set search_path='' as $$
declare listing uuid;
begin
 listing=(case when tg_table_name='listings' then to_jsonb(new)->>'id' when tg_op='DELETE' then to_jsonb(old)->>'listing_id' else to_jsonb(new)->>'listing_id' end)::uuid;
 if exists(select 1 from public.listings l where l.id=listing and l.is_published and l.retired_at is null) and not private.listing_content_approved(listing) then
  raise exception using errcode='23514',message='Published listing requires approved text and photographs';end if;
 return null;
end;$$;
create constraint trigger listing_content_safety after insert or update on public.listings deferrable initially deferred for each row execute function private.guard_published_listing_safety();
create constraint trigger listing_option_content_safety after insert or update or delete on public.listing_price_options deferrable initially deferred for each row execute function private.guard_published_listing_safety();
create constraint trigger listing_media_content_safety after insert or update or delete on public.listing_media deferrable initially deferred for each row execute function private.guard_published_listing_safety();
create function private.guard_store_content_safety() returns trigger language plpgsql set search_path='' as $$
begin
 if new.setup_completed_at is not null and (tg_op='INSERT' or
  (new.name,new.username,new.description,new.primary_category,new.location,new.setup_completed_at) is distinct from
  (old.name,old.username,old.description,old.primary_category,old.location,old.setup_completed_at)) and
  not private.content_safety_approved(new.seller_context_id,'store_text',encode(sha256(convert_to(array_to_json(array[new.name,coalesce(new.username,''),coalesce(new.description,''),coalesce(new.primary_category,''),coalesce(new.location,'')])::text,'UTF8')),'hex')) then
  raise exception using errcode='23514',message='Store profile requires approved marketplace text';end if;
 return new;
end;$$;
create trigger store_content_safety before insert or update on public.stores for each row execute function private.guard_store_content_safety();

create or replace function private.store_is_public(store uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.stores s join public.account_contexts c on c.id=s.seller_context_id join public.seller_applications a on a.seller_context_id=c.id and a.id=s.application_id and a.registration_generation=c.seller_generation and s.registration_generation=c.seller_generation
  where s.id=store and s.status='active' and s.setup_completed_at is not null and s.activated_at is not null and c.kind='seller' and c.status='active' and a.status='approved' and not (private.account_access(c.id)->>'banned')::boolean
  and exists(select 1 from public.payments p where p.store_id=s.id and p.purpose='store_activation' and private.payment_grants_access(p.id))
  and exists(select 1 from public.store_subscriptions sub where sub.store_id=s.id and sub.status='active' and sub.starts_at<=now() and sub.ends_at>now() and private.payment_grants_access(sub.payment_id))
  and exists(select 1 from public.store_fee_periods f where f.store_id=s.id and f.starts_at<=now() and f.ends_at>now() and private.payment_grants_access(f.payment_id))
  and private.content_safety_approved(s.seller_context_id,'store_text',private.store_text_digest(s.id))
  and not exists(select 1 from public.media_assets m where ('/api/media/'||m.id::text in(s.logo_path,s.cover_path)) and not private.media_content_approved(m.id)));
$$;
create or replace function private.media_asset_is_public(asset uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets m where m.id=asset and m.state='ready' and private.media_content_approved(m.id) and (
  (m.purpose='hostel' and exists(select 1 from private.residence_catalog r where r.cover_path='/api/media/'||m.id::text or '/api/media/'||m.id::text=any(r.gallery_paths))) or
  (m.purpose='market' and (
   exists(select 1 from public.listing_media lm join public.listings l on l.id=lm.listing_id where lm.storage_path='/api/media/'||m.id::text and l.is_published and private.listing_content_approved(l.id) and private.store_is_public(l.store_id)) or
   exists(select 1 from public.listing_price_options o join public.listings l on l.id=o.listing_id where o.image_path='/api/media/'||m.id::text and l.is_published and private.listing_content_approved(l.id) and private.store_is_public(l.store_id)) or
   exists(select 1 from private.store_catalog s where s.logo_path='/api/media/'||m.id::text or s.cover_path='/api/media/'||m.id::text)))));
$$;
-- Preserve the existing reviewed projection columns and platform access gate.
create or replace view private.listing_catalog with(security_barrier=true) as
 select l.id,l.store_id,l.kind,l.title,l.description,l.category,l.price,l.currency,l.service_location_mode,l.latitude,l.longitude,l.created_at,
  (l.kind='service' or l.stock_quantity>reserved.quantity) as is_available,
  case when l.kind='service' then null else greatest(0,l.stock_quantity-reserved.quantity) end as stock_quantity,
  l.condition,l.meeting_location,l.call_line,l.working_days,l.opening_time,l.closing_time,l.is_open_247,l.service_category
 from public.listings l cross join lateral(select coalesce(sum(o.quantity),0)::integer as quantity from public.market_orders o
  where o.listing_id=l.id and o.status in('awaiting_seller','pending_meetup') and o.reserved_until>now()) reserved
 where l.retired_at is null and l.is_published and private.store_is_public(l.store_id) and private.listing_content_approved(l.id) and private.platform_access_allowed();
create or replace view private.listing_media_public with(security_barrier=true) as
 select m.id,m.listing_id,m.sort_order,m.storage_path from public.listing_media m join public.listings l on l.id=m.listing_id
 where l.is_published and private.store_is_public(l.store_id) and private.listing_content_approved(l.id) and private.platform_access_allowed();
create or replace view private.listing_price_options_public with(security_barrier=true) as
 select o.id,o.listing_id,o.sort_order,o.label,o.price,o.image_path from public.listing_price_options o join public.listings l on l.id=o.listing_id
 where l.is_published and private.store_is_public(l.store_id) and private.listing_content_approved(l.id) and private.platform_access_allowed();

-- These are additional restrictions, never replacement permissive policies.
create policy content_safety_media_read on public.media_assets as restrictive for select to authenticated
 using(private.media_content_approved(id));
create policy content_safety_storage_read on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'pinevela-media' or exists(select 1 from public.media_assets m where m.bucket_id=storage.objects.bucket_id and m.object_path=storage.objects.name and private.media_content_approved(m.id)));
create policy content_safety_listing_read on public.listings as restrictive for select to authenticated
 using(exists(select 1 from public.stores s where s.id=listings.store_id and s.seller_context_id=private.current_context_id()) or private.listing_content_approved(id));

revoke all on function private.content_safety_approved(uuid,text,text),private.media_content_approved(uuid),private.listing_text_digest(uuid),private.store_text_digest(uuid),private.listing_content_approved(uuid)
 from public,anon,authenticated,pinevela_backend,pinevela_catalog;
grant execute on function private.content_safety_approved(uuid,text,text),private.media_content_approved(uuid),private.listing_content_approved(uuid)
 to authenticated,pinevela_backend,pinevela_catalog;
revoke all on function private.retain_content_safety_history(),private.guard_media_content_safety(),private.guard_profile_content_safety(),private.guard_published_listing_safety(),private.guard_store_content_safety()
 from public,anon,authenticated,pinevela_backend,pinevela_catalog;
