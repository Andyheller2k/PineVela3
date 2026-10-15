-- Appearance belongs to the active portal, including when portals share an
-- Auth identity. Only the verified backend binding may read or save it.
create table private.account_appearance (
  context_id uuid primary key references public.account_contexts(id) on delete cascade,
  theme text not null check (theme in ('light','dark')),
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.account_appearance enable row level security;
revoke all on private.account_appearance from public,anon,authenticated,pinevela_backend;
grant select,insert(context_id,theme),update(theme,updated_at)
  on private.account_appearance to pinevela_backend;
create policy account_appearance_read on private.account_appearance
  for select to pinevela_backend
  using (context_id=(select private.current_context_id()));
create policy account_appearance_insert on private.account_appearance
  for insert to pinevela_backend
  with check (context_id=(select private.current_context_id()));
create policy account_appearance_update on private.account_appearance
  for update to pinevela_backend
  using (context_id=(select private.current_context_id()))
  with check (context_id=(select private.current_context_id()));
