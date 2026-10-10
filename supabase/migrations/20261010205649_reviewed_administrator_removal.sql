-- Four independent approvals, private appeals and explicit founder execution.
-- Remove the administrator portal only. Retain Auth, primary access and history.
alter table public.admin_proposals add column removal_roster_revision bigint,
  add column removal_plea_until timestamptz;
update public.admin_proposals set removal_roster_revision=0,
  status=case when status in ('pending','approved') then 'invalidated' else status end
  where kind='administrator_removal';
alter table public.admin_proposals drop constraint admin_proposals_status_check;
alter table public.admin_proposals add constraint admin_proposals_status_check check
  (status in ('pending','approved','rejected','invalidated','executed','expired') or
    kind='administrator_removal' and status in ('awaiting-plea','plea-submitted','plea-rejected','revoked'));
alter table public.admin_proposals add constraint removal_revision_present check
  (kind<>'administrator_removal' or removal_roster_revision is not null and removal_roster_revision>=0);
create unique index administrator_removal_open on public.admin_proposals(target_context_id)
  where kind='administrator_removal' and status in ('pending','awaiting-plea','plea-submitted','plea-rejected');
-- Tombstones retain original slot/vote foreign keys without occupying a live slot.
alter table public.admin_memberships drop constraint admin_memberships_slot_key;
create unique index administrator_current_slot on public.admin_memberships(slot) where status<>'removed';
create table private.administrator_appeals (
  proposal_id uuid primary key references public.admin_proposals(id),
  message text not null check(length(btrim(message)) between 3 and 2000),
  submitted_at timestamptz not null default clock_timestamp(),
  decision text check(decision in ('accepted','rejected')),
  decision_reason text,
  decided_at timestamptz,
  acknowledged_at timestamptz,
  check((decision is null)=(decision_reason is null) and (decision is null)=(decided_at is null)),
  check(decision_reason is null or length(btrim(decision_reason)) between 3 and 500),
  check(acknowledged_at is null or decision is not null)
);
alter table private.administrator_appeals enable row level security;
revoke all on private.administrator_appeals from public,anon,authenticated,pinevela_backend;

create function private.removal_founder() returns uuid language sql stable set search_path='' as $$
  select m.context_id from public.admin_memberships m where m.slot=1 and m.status='active'
    and m.context_id=private.approval_authorized_context();
$$;
create function private.removal_roster(target uuid) returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(r order by (r->>'slot')::int),'[]'::jsonb)
    from jsonb_array_elements(private.recovery_roster()) r where r->>'id'<>target::text;
$$;
create function private.removal_current(p public.admin_proposals) returns boolean
language sql stable set search_path='' as $$
  select p.kind='administrator_removal' and p.quorum=4
    and p.removal_roster_revision=(select roster_revision from private.admin_pricing_state where singleton)
    and p.baseline_digest=private.recovery_digest(p.target_context_id,'remove',p.removal_roster_revision)
    and p.preview=jsonb_build_object('action','remove','removalVersion',2,'roster',private.removal_roster(p.target_context_id))
    and jsonb_array_length(private.removal_roster(p.target_context_id))=4
    and exists(select 1 from public.admin_memberships where context_id=p.proposer_context_id and slot=1 and status='active')
    and exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
      where m.context_id=p.target_context_id and m.slot<>1 and m.status in ('active','suspended') and c.kind='admin' and c.status='active')
    and (select count(*) from public.admin_memberships where status<>'removed')=5;
$$;
create function private.removal_quorum(proposal uuid) returns boolean language sql stable set search_path='' as $$
  select count(*)=4 and coalesce(bool_and(v.decision='approved' and v.administrator_context_id<>p.target_context_id
    and m.status='active' and c.status='active' and c.kind='admin' and k.approval_key_hash is not null
    and exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=v.administrator_context_id::text)),false)
    from public.admin_votes v join public.admin_proposals p on p.id=v.proposal_id
    join public.admin_memberships m on m.context_id=v.administrator_context_id
    join public.account_contexts c on c.id=m.context_id join private.admin_secrets k on k.context_id=m.context_id
    where v.proposal_id=proposal;
$$;
create function private.removal_execution_allowed(target uuid) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.admin_proposals p where p.id::text=current_setting('pinevela.admin_removal_proposal_id',true)
    and current_setting('pinevela.admin_removal_confirmation',true)='REMOVE ADMINISTRATOR'
    and p.target_context_id=target and private.removal_founder()=p.proposer_context_id
    and private.removal_current(p) and private.removal_quorum(p.id)
    and (p.status='plea-rejected' and exists(select 1 from private.administrator_appeals a where a.proposal_id=p.id and a.decision='rejected')
      or p.status='awaiting-plea' and p.removal_plea_until<=clock_timestamp()
        and not exists(select 1 from private.administrator_appeals where proposal_id=p.id)));
$$;

create function private.removal_proposal_guard() returns trigger language plpgsql set search_path='' as $$
declare actor uuid; valid boolean;
begin
  if tg_op='DELETE' then
    if old.kind='administrator_removal' then raise exception using errcode='42501',message='Removal history is immutable';end if;return old;
  end if;
  if tg_op='UPDATE' and new.kind<>old.kind and (new.kind='administrator_removal' or old.kind='administrator_removal') then
    raise exception using errcode='42501',message='Proposal kind is immutable';end if;
  if new.kind<>'administrator_removal' then return new;end if;
  actor:=private.approval_authorized_context();
  if tg_op='INSERT' then
    if private.removal_founder() is distinct from new.proposer_context_id or actor is null or not coalesce(private.removal_current(new),false)
      or new.status<>'pending' or new.target_residence_id is not null or length(btrim(new.reason)) not between 3 and 500
      or new.removal_plea_until is not null or new.decided_at is not null or new.executed_at is not null or new.executed_by_context_id is not null then
      raise exception using errcode='42501',message='Founder-reviewed four-voter removal proposal required';end if;
    new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
  else
    if (to_jsonb(new)-array['status','decided_at','executed_at','executed_by_context_id','removal_plea_until']) is distinct from
       (to_jsonb(old)-array['status','decided_at','executed_at','executed_by_context_id','removal_plea_until']) then
      raise exception using errcode='42501',message='Removal preview and electorate are immutable';end if;
    if (new.decided_at,new.executed_at,new.executed_by_context_id,new.removal_plea_until) is distinct from
       (old.decided_at,old.executed_at,old.executed_by_context_id,old.removal_plea_until) then
      raise exception using errcode='42501',message='Removal lifecycle timestamps are server controlled';end if;
    if new.status=old.status then return new;end if;
    valid:=coalesce(private.removal_current(old),false);
    if old.status in ('pending','awaiting-plea','plea-submitted','plea-rejected') and new.status='invalidated'
      and old.removal_roster_revision<>(select roster_revision from private.admin_pricing_state where singleton) then null;
    elsif old.status='pending' and new.status='expired' and old.expires_at<=clock_timestamp() then null;
    elsif old.status='pending' and old.expires_at>clock_timestamp() and valid and actor is not null
      and new.status='rejected' and exists(select 1 from public.admin_votes where proposal_id=old.id and administrator_context_id=actor and decision='rejected') then null;
    elsif old.status='pending' and old.expires_at>clock_timestamp() and valid and actor is not null
      and new.status='awaiting-plea' and private.removal_quorum(old.id) then
      new.removal_plea_until:=clock_timestamp()+interval '24 hours';
    elsif old.status='awaiting-plea' and new.status='plea-submitted' and valid and private.removal_quorum(old.id)
      and private.current_context_id()=old.target_context_id and old.removal_plea_until>clock_timestamp()
      and exists(select 1 from private.administrator_appeals where proposal_id=old.id) then null;
    elsif old.status='plea-submitted' and valid and private.removal_quorum(old.id)
      and private.removal_founder()=old.proposer_context_id and
        exists(select 1 from private.administrator_appeals where proposal_id=old.id
          and (decision='accepted' and new.status='revoked' or decision='rejected' and new.status='plea-rejected')) then null;
    elsif old.status in ('awaiting-plea','plea-rejected') and new.status='executed'
      and private.removal_founder()=old.proposer_context_id and private.removal_quorum(old.id)
      and old.id::text=current_setting('pinevela.admin_removal_proposal_id',true)
      and current_setting('pinevela.admin_removal_confirmation',true)='REMOVE ADMINISTRATOR'
      and exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
        where m.context_id=old.target_context_id and m.status='removed' and c.status='closed')
      and not exists(select 1 from private.admin_secrets where context_id=old.target_context_id)
      and (old.status='plea-rejected' and exists(select 1 from private.administrator_appeals where proposal_id=old.id and decision='rejected')
        or old.status='awaiting-plea' and old.removal_plea_until<=clock_timestamp() and not exists(select 1 from private.administrator_appeals where proposal_id=old.id)) then
      new.executed_at:=clock_timestamp();new.executed_by_context_id:=actor;
    else raise exception using errcode='42501',message='Independent removal review and founder confirmation required';end if;
    new.decided_at:=clock_timestamp();
  end if;return new;
end;
$$;
create trigger removal_proposal_guard before insert or update or delete on public.admin_proposals
  for each row execute function private.removal_proposal_guard();
create function private.removal_vote_guard() returns trigger language plpgsql set search_path='' as $$
declare p public.admin_proposals; actor uuid;
begin
  if tg_op='UPDATE' and exists(select 1 from public.admin_proposals where id=old.proposal_id and kind='administrator_removal') then
    raise exception using errcode='42501',message='Removal votes are immutable';end if;
  select * into p from public.admin_proposals where id=case when tg_op='DELETE' then old.proposal_id else new.proposal_id end;
  if p.kind<>'administrator_removal' then return case when tg_op='DELETE' then old else new end;end if;
  if tg_op<>'INSERT' then raise exception using errcode='42501',message='Removal votes are immutable';end if;
  actor:=private.approval_authorized_context();
  if actor is null or actor is distinct from new.administrator_context_id or p.status<>'pending' or p.expires_at<=clock_timestamp()
    or not coalesce(private.removal_current(p),false) or actor=p.target_context_id
    or not exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=actor::text)
    or (select count(*) from public.admin_votes where proposal_id=p.id)>=4
    or actor=p.proposer_context_id and new.decision<>'approved'
    or actor<>p.proposer_context_id and not exists(select 1 from public.admin_votes where proposal_id=p.id and administrator_context_id=p.proposer_context_id and decision='approved') then
    raise exception using errcode='42501',message='Current independent approval key and reviewed electorate required';end if;
  new.decided_at:=clock_timestamp();return new;
end;
$$;
create trigger removal_vote_guard before insert or update or delete on public.admin_votes
  for each row execute function private.removal_vote_guard();
create function private.removal_vote_recorded() returns trigger language plpgsql set search_path='' as $$
declare p public.admin_proposals;
begin
  select * into p from public.admin_proposals where id=new.proposal_id;
  if p.kind<>'administrator_removal' then return null;end if;
  if new.decision='rejected' then update public.admin_proposals set status='rejected' where id=p.id;
  elsif private.removal_quorum(p.id) then update public.admin_proposals set status='awaiting-plea' where id=p.id;end if;
  return null;
end;
$$;
create trigger removal_vote_recorded after insert on public.admin_votes for each row execute function private.removal_vote_recorded();

create function private.administrator_appeal_guard() returns trigger language plpgsql set search_path='' as $$
declare p public.admin_proposals;
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Appeal history is immutable';end if;
  select * into p from public.admin_proposals where id=new.proposal_id for update;
  if tg_op='INSERT' then
    if private.current_context_id() is distinct from p.target_context_id or p.status<>'awaiting-plea'
      or p.removal_plea_until<=clock_timestamp() or not coalesce(private.removal_current(p),false) or not private.removal_quorum(p.id)
      or new.decision is not null or new.decision_reason is not null or new.decided_at is not null or new.acknowledged_at is not null then
      raise exception using errcode='42501',message='Target-only timely removal plea required';end if;
    new.submitted_at:=clock_timestamp();
  else
    if (new.proposal_id,new.message,new.submitted_at,new.decided_at,new.acknowledged_at) is distinct from
       (old.proposal_id,old.message,old.submitted_at,old.decided_at,old.acknowledged_at) then
      -- Acknowledgement is the single permitted change in this branch.
      if (new.proposal_id,new.message,new.submitted_at,new.decision,new.decision_reason,new.decided_at) is not distinct from
         (old.proposal_id,old.message,old.submitted_at,old.decision,old.decision_reason,old.decided_at)
        and old.decision is not null and old.acknowledged_at is null and new.acknowledged_at is not null
        and private.current_context_id()=p.target_context_id then new.acknowledged_at:=clock_timestamp();return new;end if;
      raise exception using errcode='42501',message='Appeal text and timestamps are immutable';end if;
    if (new.decision,new.decision_reason) is not distinct from (old.decision,old.decision_reason) then return new;end if;
    if old.decision is not null or new.decision is null or p.status<>'plea-submitted'
      or private.removal_founder() is distinct from p.proposer_context_id or not coalesce(private.removal_current(p),false) or not private.removal_quorum(p.id) then
      raise exception using errcode='42501',message='Current founder approval key required for pending appeal';end if;
    new.decided_at:=clock_timestamp();
  end if;return new;
end;
$$;
create trigger administrator_appeal_guard before insert or update or delete on private.administrator_appeals
  for each row execute function private.administrator_appeal_guard();
create function private.administrator_appeal_recorded() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then update public.admin_proposals set status='plea-submitted' where id=new.proposal_id;
  elsif new.decision is distinct from old.decision then update public.admin_proposals
    set status=case when new.decision='accepted' then 'revoked' else 'plea-rejected' end where id=new.proposal_id;
  end if;return null;
end;
$$;
create trigger administrator_appeal_recorded after insert or update on private.administrator_appeals
  for each row execute function private.administrator_appeal_recorded();

create function private.removal_proposal_recorded() returns trigger language plpgsql set search_path='' as $$
declare event text;notice uuid;recipient uuid;target_label text;
begin
  if new.kind<>'administrator_removal' or tg_op='UPDATE' and new.status=old.status then return null;end if;
  event:=case when tg_op='INSERT' then 'submitted' else new.status end;
  select 'Administrator #'||m.slot::text||' ('||coalesce(nullif(f.display_name,''),'administrator')||')'
    into target_label from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    join public.profiles f on f.id=c.auth_user_id where m.context_id=new.target_context_id;
  insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values(private.current_context_id(),'administrator_removal_'||event,'admin_proposal',new.id);
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(private.current_context_id(),'admin_governance','Administrator removal '||event,
      target_label||case when event='executed' then ': administrator access was permanently removed. Existing administrator sessions are revoked. The verified login and primary account remain usable.'
        else ': removal review changed state. Open Admin Approvals for the reviewed decision. Appeal text remains private.' end,'governance') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id)
    select notice,recipients.id from (
      select m.context_id as id from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
        where m.status='active' and c.kind='admin' and c.status='active'
      union select new.target_context_id
      union select primary_context.id from public.account_contexts target join public.account_contexts primary_context
        on primary_context.auth_user_id=target.auth_user_id and primary_context.kind='primary' and primary_context.status='active'
        where target.id=new.target_context_id
    ) recipients where recipients.id is not null;
  for recipient in select context_id from public.notification_recipients where notification_id=notice loop
    perform pg_notify('pinevela_notifications',recipient::text);
  end loop;return null;
end;
$$;
create trigger removal_proposal_recorded after insert or update on public.admin_proposals
  for each row execute function private.removal_proposal_recorded();

-- Server credentials and roster changes invalidate all unfinished removal reviews.
create or replace function private.pricing_roster_changed() returns trigger language plpgsql set search_path='' as $$
declare changed boolean; executing text; removing text;
begin
  if tg_table_name='admin_memberships' then
    if tg_op<>'UPDATE' then changed:=true;else changed:=(new.context_id,new.slot,new.status) is distinct from (old.context_id,old.slot,old.status);end if;
  elsif tg_table_name='account_contexts' then
    if tg_op='INSERT' then changed:=new.kind='admin';elsif tg_op='DELETE' then changed:=old.kind='admin';
    else changed:=(new.kind='admin' or old.kind='admin') and (new.status,new.kind,new.auth_user_id) is distinct from (old.status,old.kind,old.auth_user_id);end if;
  else
    if tg_op='INSERT' then changed:=new.settings_key_hash is not null or new.approval_key_hash is not null;
    elsif tg_op='DELETE' then changed:=old.settings_key_hash is not null or old.approval_key_hash is not null;
    else changed:=(new.settings_key_hash,new.settings_key_version,new.approval_key_hash,new.approval_key_version)
      is distinct from (old.settings_key_hash,old.settings_key_version,old.approval_key_hash,old.approval_key_version);end if;
  end if;
  if changed then
    update private.admin_pricing_state set roster_revision=roster_revision+1 where singleton;
    executing:=coalesce(current_setting('pinevela.admin_recovery_proposal_id',true),'');
    removing:=coalesce(current_setting('pinevela.admin_removal_proposal_id',true),'');
    update public.admin_proposals set status='invalidated' where
      status in ('pending','approved') and (kind='pricing' or kind='administrator_key_reset' and id::text<>executing)
      or kind='administrator_removal' and status in ('pending','awaiting-plea','plea-submitted','plea-rejected') and id::text<>removing;
  end if;return null;
end;
$$;

revoke all on function private.removal_founder(),private.removal_roster(uuid),private.removal_current(public.admin_proposals),
  private.removal_quorum(uuid),private.removal_execution_allowed(uuid),private.removal_proposal_guard(),private.removal_vote_guard(),
  private.removal_vote_recorded(),private.administrator_appeal_guard(),private.administrator_appeal_recorded(),
  private.removal_proposal_recorded() from public,anon,authenticated,pinevela_backend;

create or replace function private.guard_administrator_membership_status() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
  if (new.context_id,new.slot,new.joined_at) is distinct from (old.context_id,old.slot,old.joined_at)
    or new.sessions_invalidated_at is distinct from old.sessions_invalidated_at
    or new.changed_at is distinct from old.changed_at then
    raise exception using errcode='42501',message='Administrator identity and lifecycle metadata are immutable';end if;
  if new.status is not distinct from old.status then return new;end if;
  if old.slot=1 then raise exception using errcode='42501',message='The founder cannot be suspended or removed';end if;
  if new.status='removed' and old.status in ('active','suspended') and private.removal_execution_allowed(old.context_id) then
    new.changed_at:=clock_timestamp();new.sessions_invalidated_at:=new.changed_at;return new;end if;
  if old.status not in ('active','suspended') or new.status not in ('active','suspended') then
    raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
  actor:=private.approval_authorized_context();
  if actor is null or not exists(select 1 from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    where m.context_id=actor and m.slot=1 and m.status='active' and c.kind='admin' and c.status='active') then
    raise exception using errcode='42501',message='The active founder approval key is required';end if;
  new.changed_at:=clock_timestamp();new.sessions_invalidated_at:=new.changed_at;
  return new;
end;
$$;
create or replace function private.guard_administrator_context() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.kind='admin' or exists(select 1 from public.admin_memberships where context_id=old.id) then
    if tg_op='DELETE' then raise exception using errcode='42501',message='Administrator removal requires its independent review and appeal protocol';end if;
    if (new.id,new.auth_user_id,new.primary_owner_id,new.kind) is not distinct from (old.id,old.auth_user_id,old.primary_owner_id,old.kind)
      and old.status='active' and new.status='closed' and private.removal_founder() is not null
      and exists(select 1 from public.admin_proposals p join public.admin_memberships m on m.context_id=p.target_context_id
        where p.id::text=current_setting('pinevela.admin_removal_proposal_id',true) and p.target_context_id=old.id
          and p.kind='administrator_removal' and p.status in ('awaiting-plea','plea-rejected') and m.status='removed'
          and p.proposer_context_id=private.removal_founder() and private.removal_quorum(p.id)
          and current_setting('pinevela.admin_removal_confirmation',true)='REMOVE ADMINISTRATOR') then return new;end if;
    if (new.id,new.auth_user_id,new.primary_owner_id,new.kind,new.status) is distinct from
       (old.id,old.auth_user_id,old.primary_owner_id,old.kind,old.status) then
      raise exception using errcode='42501',message='Administrator ownership and access must use the governance protocol';end if;
  end if;
  return new;
end;
$$;
create or replace function private.administrator_membership_status_event() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid;notice uuid;recipient uuid;title text;message text;target_name text;
begin
  if new.status='removed' or new.status is not distinct from old.status then return new;end if;
  actor:=private.approval_authorized_context();
  select coalesce(nullif(p.display_name,''),'administrator') into target_name from public.account_contexts c
    join public.profiles p on p.id=c.auth_user_id where c.id=new.context_id;
  title:=case when new.status='active' then 'Administrator access restored' else 'Administrator access suspended' end;
  message:='Administrator #'||new.slot::text||' ('||target_name||'): '||case when new.status='active'
    then 'the main administrator restored access. A new sign-in is required to access the administrator portal.'
    else 'the main administrator suspended access. Administrator portal access has been revoked.' end;
  insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values(actor,'administrator_membership_'||new.status,'account_context',new.context_id,jsonb_build_object('from',old.status,'to',new.status));
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(actor,'admin_governance',title,message,'governance') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id)
    select notice,recipients.id from (
      select m.context_id as id from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
        where m.status='active' and c.kind='admin' and c.status='active'
      union select new.context_id
      union select p.id from public.account_contexts target join public.account_contexts p on p.auth_user_id=target.auth_user_id
        and p.kind='primary' and p.status='active' where target.id=new.context_id
    ) recipients;
  for recipient in select context_id from public.notification_recipients where notification_id=notice loop
    perform pg_notify('pinevela_notifications',recipient::text);
  end loop;
  return new;
end;
$$;
create or replace function private.guard_admin_invitation() returns trigger
language plpgsql set search_path='' as $$
declare actor uuid; expected_subject uuid;
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Invitation history is immutable';end if;
  actor:=private.approval_authorized_context();
  if tg_op='INSERT' then
    select id into expected_subject from auth.users where lower(email)=new.invited_email;
    if actor is null or actor is distinct from new.created_by_context_id
      or not exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active')
      or not private.invitation_issuer_valid(new) or new.invited_auth_user_id is distinct from expected_subject
      or new.accepted_at is not null or new.accepted_context_id is not null or new.cancelled_at is not null or new.cancellation_reason is not null
      or new.reserved_slot not between 2 and 5 or length(btrim(new.invited_name)) not between 1 and 100
      or new.invited_email<>lower(btrim(new.invited_email)) or new.invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or length(new.invited_email)>254 or new.invitation_digest !~ '^[a-f0-9]{64}$'
      or (select count(*) from auth.users where lower(email)=new.invited_email)>1
      or exists(select 1 from public.admin_memberships where slot=new.reserved_slot and status<>'removed')
      or exists(select 1 from public.account_contexts where auth_user_id=expected_subject and kind<>'primary') then
      raise exception using errcode='42501',message='Founder-reviewed invitation required';end if;
    new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
  else
    if (new.id,new.invited_email,new.invited_name,new.invited_auth_user_id,new.reserved_slot,new.invitation_digest,new.created_by_context_id,new.created_at,new.expires_at,new.issued_approval_key_version)
      is distinct from (old.id,old.invited_email,old.invited_name,old.invited_auth_user_id,old.reserved_slot,old.invitation_digest,old.created_by_context_id,old.created_at,old.expires_at,old.issued_approval_key_version) then
      raise exception using errcode='42501',message='Reviewed invitation is immutable';end if;
    if (new.accepted_at,new.accepted_context_id,new.cancelled_at,new.cancellation_reason)
      is not distinct from (old.accepted_at,old.accepted_context_id,old.cancelled_at,old.cancellation_reason) then return new;end if;
    if old.accepted_at is not null or old.cancelled_at is not null then raise exception using errcode='42501',message='Invitation decision is final';end if;
    if new.accepted_context_id is not null and new.cancelled_at is null and new.cancellation_reason is null
      and private.invitation_acceptance_allowed(old,new.accepted_context_id)
      and exists(select 1 from public.admin_memberships where context_id=new.accepted_context_id and slot=old.reserved_slot and status='active') then
      new.accepted_at:=clock_timestamp();
    elsif new.cancelled_at is not null and new.accepted_context_id is null and new.accepted_at is null then
      if old.expires_at<=clock_timestamp() then new.cancellation_reason:='expired';
      elsif not private.invitation_issuer_valid(old) then new.cancellation_reason:='issuer_changed';
      elsif actor is not null and exists(select 1 from public.admin_memberships where context_id=actor and slot=1 and status='active') then
        new.cancellation_reason:='cancelled';
      else raise exception using errcode='42501',message='Founder approval key required';end if;
      new.cancelled_at:=clock_timestamp();
    else raise exception using errcode='42501',message='Verified invitation acceptance required';end if;
  end if;return new;
end;
$$;
