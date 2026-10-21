-- Personal AI state only. No peer recipients, messaging routes, public RPC,
-- account-approval authority, or access to encrypted buyer/seller messages.
create table private.companion_preferences (
 context_id uuid primary key references public.account_contexts(id) on delete cascade,
 companion text not null default 'nova' check(companion in('nova','mabel','axel','ziggy')),
 response_style text not null default 'balanced' check(response_style in('balanced','brief','detailed')),
 interests text not null default '' check(length(interests)<=200),
 reminders boolean not null default true, ai_enabled boolean not null default false,
 generation integer not null default 0 check(generation>=0), active_request_id uuid, active_until timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check((active_request_id is null)=(active_until is null))
);
create table private.companion_turns (
 context_id uuid not null references public.account_contexts(id) on delete cascade,
 request_id uuid not null, companion text not null check(companion in('nova','mabel','axel','ziggy')),
 user_text text not null check(length(user_text) between 1 and 1000),
 answer text not null check(length(answer) between 1 and 6000),
 cards jsonb not null default '[]'::jsonb check(jsonb_typeof(cards)='array' and jsonb_array_length(cards)<=10 and octet_length(cards::text)<=18000),
 created_at timestamptz not null default clock_timestamp(), primary key(context_id,request_id)
);
create index companion_turns_recent on private.companion_turns(context_id,created_at desc,request_id desc);
create index companion_turns_retention on private.companion_turns(created_at);
create table private.companion_usage (
 bucket text not null check(bucket='global' or bucket ~ '^[0-9a-f-]{36}$'),usage_day date not null,
 requests integer not null check(requests between 0 and 100000),tokens integer not null check(tokens>=0),
 primary key(bucket,usage_day)
);
alter table private.companion_preferences enable row level security;
alter table private.companion_turns enable row level security;
alter table private.companion_usage enable row level security;
revoke all on private.companion_preferences,private.companion_turns,private.companion_usage from public,anon,authenticated,pinevela_catalog,pinevela_backend;
grant select,insert(context_id,companion,response_style,interests,reminders,ai_enabled),
 update(companion,response_style,interests,reminders,ai_enabled,updated_at,generation,active_request_id,active_until)
 on private.companion_preferences to pinevela_backend;
grant select,delete on private.companion_turns to pinevela_backend;
-- Completed replies are inserted only by the server after live session revalidation.
create policy companion_preferences_read on private.companion_preferences for select to pinevela_backend
 using(context_id=(select private.current_context_id()));
create policy companion_preferences_create on private.companion_preferences for insert to pinevela_backend
 with check(context_id=(select private.current_context_id()) and exists(select 1 from public.account_contexts c where c.id=context_id and c.kind='primary'));
create policy companion_preferences_change on private.companion_preferences for update to pinevela_backend
 using(context_id=(select private.current_context_id())) with check(context_id=(select private.current_context_id()));
create policy companion_turns_read on private.companion_turns for select to pinevela_backend
 using(context_id=(select private.current_context_id()));
create policy companion_turns_clear on private.companion_turns for delete to pinevela_backend
 using(context_id=(select private.current_context_id()));
-- Usage reservations have no browser/backend grants or policies. Only the
-- authenticated, primary-only server transaction may reserve or settle them.
