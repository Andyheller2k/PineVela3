-- Additive cutover: preserve historical plaintext; require ciphertext for every new send.
create table private.market_chat_keys (
 context_id uuid primary key references public.account_contexts(id),
 public_identity jsonb not null check(jsonb_typeof(public_identity)='object' and public_identity->>'v'='1'
  and public_identity->>'fingerprint' ~ '^[0-9a-f]{64}$'),
 encrypted_backup jsonb not null check(jsonb_typeof(encrypted_backup)='object' and encrypted_backup->>'v'='1'
  and octet_length(encrypted_backup::text)<=8192),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.market_chat_keys enable row level security;
revoke all on private.market_chat_keys from public,anon,authenticated,pinevela_backend;
grant select on private.market_chat_keys to pinevela_backend;
create policy own_chat_key_backup on private.market_chat_keys for select to pinevela_backend
 using(context_id=private.current_context_id() and private.current_kind() in('primary','seller'));
create function private.immutable_chat_identity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Chat encryption identities are immutable; a recovery phrase is required' using errcode='23514'; end if;
 if new.context_id is distinct from private.current_context_id() or private.current_kind() not in('primary','seller') then
  raise exception 'Verified buyer or seller identity required' using errcode='23514';
 end if;
 return new;
end;$$;
create trigger immutable_chat_identity before insert or update or delete on private.market_chat_keys for each row execute function private.immutable_chat_identity();
revoke all on function private.immutable_chat_identity() from public,anon,authenticated,pinevela_backend;

alter table public.market_messages
 add column encryption_version integer not null default 0 check(encryption_version in(0,1)),
 add column recipient_context_id uuid references public.account_contexts(id),
 add column encrypted_payload jsonb,
 drop constraint market_messages_body_check,
 add constraint market_messages_body_check check(
  (encryption_version=0 and encrypted_payload is null and recipient_context_id is null and length(trim(body)) between 1 and 5000)
  or (encryption_version=1 and body='' and recipient_context_id is not null and recipient_context_id<>sender_context_id
   and jsonb_typeof(encrypted_payload)='object' and encrypted_payload->>'v'='1'
   and encrypted_payload->>'algorithm'='PV-E2EE-P256-A256GCM-v1' and octet_length(encrypted_payload::text)<=32768));
create function private.require_encrypted_market_message() returns trigger language plpgsql security invoker set search_path='' as $$
declare seller uuid; sender_key text; recipient_key text;
begin
 if tg_op<>'INSERT' then raise exception 'Message encryption history is immutable' using errcode='23514'; end if;
 select seller_context_id into seller from public.stores where id=new.store_id;
 if new.encryption_version<>1 or new.body<>'' or new.encrypted_payload is null
   or new.recipient_context_id is distinct from (case when new.sender_context_id=new.buyer_context_id then seller else new.buyer_context_id end) then
  raise exception 'New marketplace messages require participant-bound end-to-end encryption' using errcode='23514';
 end if;
 select public_identity->>'fingerprint' into sender_key from private.market_chat_keys where context_id=new.sender_context_id;
 select public_identity->>'fingerprint' into recipient_key from private.market_chat_keys where context_id=new.recipient_context_id;
 if sender_key is null or recipient_key is null or new.encrypted_payload->>'senderKey' is distinct from sender_key or new.encrypted_payload->>'recipientKey' is distinct from recipient_key then
  raise exception 'Registered encryption keys required for both participants' using errcode='23514';
 end if;
 return new;
end;$$;
create trigger encrypted_message_boundary before insert or update or delete on public.market_messages for each row execute function private.require_encrypted_market_message();
revoke all on function private.require_encrypted_market_message() from public,anon,authenticated,pinevela_backend;
