-- Real pricing governance; no operational accounts, votes or prices are seeded.
create table private.admin_pricing_state (
  singleton boolean primary key default true check (singleton),
  roster_revision bigint not null default 0 check (roster_revision >= 0),
  pricing_revision bigint not null default 0 check (pricing_revision >= 0),
  last_applied_proposal_id uuid references public.admin_proposals(id)
);
insert into private.admin_pricing_state(singleton) values(true);
alter table private.admin_pricing_state enable row level security;
revoke all on private.admin_pricing_state from public,anon,authenticated,pinevela_backend;
alter table public.admin_proposals add column pricing_roster_revision bigint,
  add column pricing_revision bigint;
-- Historical pricing rows cannot become approvals in the new keyed protocol.
update public.admin_proposals set pricing_roster_revision=0,pricing_revision=0,
  status=case when status in ('pending','approved') then 'invalidated' else status end where kind='pricing';
alter table public.admin_proposals add constraint pricing_revisions_present check
  (kind<>'pricing' or (pricing_roster_revision is not null and pricing_revision is not null
    and pricing_roster_revision>=0 and pricing_revision>=0));

create function private.pricing_projection(v jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('registrationFee',coalesce(v->'registrationFee','50'::jsonb),
    'commission',coalesce(v->'commission','0'::jsonb),'semesterFee',coalesce(v->'semesterFee','300'::jsonb),
    'subscriptionPrices',jsonb_build_object('default',coalesce(v->'subscriptionPrices'->'default','0'::jsonb),
      'star',coalesce(v->'subscriptionPrices'->'star','90'::jsonb),'pro',coalesce(v->'subscriptionPrices'->'pro','150'::jsonb)));
$$;
create function private.valid_pricing(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; n numeric;
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(v))<>4
    or not (v ?& array['registrationFee','commission','semesterFee','subscriptionPrices'])
    or jsonb_typeof(v->'subscriptionPrices') is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(v->'subscriptionPrices'))<>3
    or not ((v->'subscriptionPrices') ?& array['default','star','pro']) then return false; end if;
  foreach k in array array['registrationFee','commission','semesterFee'] loop
    if jsonb_typeof(v->k) is distinct from 'number' then return false; end if;
    n:=(v->>k)::numeric;
    if n<0 or n>(case when k='commission' then 100 else 1000000 end)
      or (k<>'commission' and ((n<>0 and n<0.1) or round(n*100)<>n*100)) then return false; end if;
  end loop;
  foreach k in array array['default','star','pro'] loop
    if jsonb_typeof(v->'subscriptionPrices'->k) is distinct from 'number' then return false; end if;
    n:=(v->'subscriptionPrices'->>k)::numeric;
    if n<0 or n>1000000 or (n<>0 and n<0.1) or round(n*100)<>n*100 then return false; end if;
  end loop;
  return true;
end;
$$;
alter table private.platform_settings add constraint platform_pricing_valid check
  (key<>'platform' or private.valid_pricing(private.pricing_projection(value)));

create function private.pricing_roster() returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',m.context_id,'slot',m.slot,
    'name',coalesce(nullif(p.display_name,''),p.email)) order by m.slot),'[]'::jsonb)
  from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    join public.profiles p on p.id=c.auth_user_id where m.status='active' and c.status='active' and c.kind='admin';
$$;
create function private.pricing_roster_ready() returns boolean
language sql stable set search_path='' as $$
  select count(*) between 3 and 5 and count(*) filter(where k.settings_key_hash is not null)>=3
    and coalesce(bool_or(m.slot=1 and k.settings_key_hash is not null),false)
  from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    left join private.admin_secrets k on k.context_id=m.context_id
  where m.status='active' and c.status='active' and c.kind='admin';
$$;
create function private.pricing_roster_identity(v jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',item->'id','slot',item->'slot') order by position),'[]'::jsonb)
    from jsonb_array_elements(v) with ordinality as roster(item,position);
$$;
create function private.settings_authorized_context() returns uuid
language sql stable set search_path='' as $$
  select k.context_id from private.admin_secrets k where k.context_id=private.current_context_id()
    and private.current_kind()='admin' and k.settings_key_hash is not null
    and k.settings_key_version::text=current_setting('pinevela.settings_key_version',true)
    and (k.settings_locked_until is null or k.settings_locked_until<=clock_timestamp());
$$;
create function private.pricing_notice(proposal uuid,event text,title text,message text) returns void
language plpgsql set search_path='' as $$
declare notice uuid; recipient uuid;
begin
  insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values(private.current_context_id(),event,'admin_proposal',proposal);
  insert into public.notifications(sender_context_id,category,title,message,link)
    values(private.current_context_id(),'admin_settings',title,message,'admin-settings') returning id into notice;
  insert into public.notification_recipients(notification_id,context_id)
    select notice,m.context_id from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    where m.status='active' and c.status='active' and c.kind='admin';
  for recipient in select context_id from public.notification_recipients where notification_id=notice loop
    perform pg_notify('pinevela_notifications',recipient::text);
  end loop;
end;
$$;
create function private.pricing_proposal_guard() returns trigger
language plpgsql set search_path='' as $$
declare a uuid; state private.admin_pricing_state; approvals integer; rejections integer; prices jsonb;
begin
  if tg_op='DELETE' then
    if old.kind='pricing' then raise exception using errcode='42501',message='Pricing decision history is immutable'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and new.kind is distinct from old.kind then
    raise exception using errcode='42501',message='Proposal kind is immutable';
  end if;
  if new.kind<>'pricing' then return new; end if;
  select * into state from private.admin_pricing_state where singleton for update;
  select private.pricing_projection(value) into prices from private.platform_settings where key='platform';
  prices:=coalesce(prices,private.pricing_projection(null));
  if tg_op='INSERT' then
    a:=private.settings_authorized_context();
    if a is null or a is distinct from new.proposer_context_id or not private.pricing_roster_ready()
      or new.quorum<>3 or new.status<>'pending' or new.target_context_id is not null or new.target_residence_id is not null
      or jsonb_typeof(new.preview) is distinct from 'object' or (select count(*) from jsonb_object_keys(new.preview))<>3
      or new.preview->'before' is distinct from prices or new.preview->'roster' is distinct from private.pricing_roster()
      or not private.valid_pricing(new.preview->'prices') or new.preview->'prices'=prices
      or new.pricing_roster_revision is distinct from state.roster_revision or new.pricing_revision is distinct from state.pricing_revision
      or new.baseline_digest is distinct from (state.roster_revision::text||':'||state.pricing_revision::text)
      or length(trim(new.reason)) not between 3 and 500
      or new.executed_at is not null or new.executed_by_context_id is not null or new.decided_at is not null then
      raise exception using errcode='42501',message='Verified immutable pricing proposal required';
    end if;
    new.created_at:=clock_timestamp();new.expires_at:=new.created_at+interval '24 hours';
    return new;
  end if;
  if new is not distinct from old then return new; end if;
  if (to_jsonb(new)-array['status','decided_at','executed_at','executed_by_context_id']) is distinct from
    (to_jsonb(old)-array['status','decided_at','executed_at','executed_by_context_id'])
    or old.status not in ('pending','approved') then
    raise exception using errcode='42501',message='Pricing proposal and completed history are immutable';
  end if;
  select count(*) filter(where v.decision='approved'),count(*) filter(where v.decision='rejected') into approvals,rejections
    from public.admin_votes v where v.proposal_id=new.id;
  if new.status='invalidated' then
    if new.pricing_roster_revision=state.roster_revision and new.pricing_revision=state.pricing_revision
      and new.preview->'before'=prices and private.pricing_roster_identity(new.preview->'roster')=private.pricing_roster_identity(private.pricing_roster()) then
      raise exception using errcode='42501',message='Current proposal cannot be invalidated arbitrarily';
    end if;
  elsif new.status='expired' then
    if new.expires_at>clock_timestamp() then raise exception using errcode='42501',message='Proposal has not expired'; end if;
  elsif new.status='executed' then
    a:=private.settings_authorized_context();
    if old.status<>'approved' or a is null or not exists(select 1 from public.admin_memberships where context_id=a and slot=1 and status='active')
      or new.executed_by_context_id is distinct from a or state.last_applied_proposal_id is distinct from new.id
      or new.pricing_roster_revision<>state.roster_revision or new.pricing_revision+1<>state.pricing_revision
      or new.preview->'prices' is distinct from prices or private.pricing_roster_identity(new.preview->'roster') is distinct from private.pricing_roster_identity(private.pricing_roster())
      or approvals<3 or new.expires_at<=clock_timestamp() then
      raise exception using errcode='42501',message='Founder execution of approved pricing required';
    end if;
    new.executed_at:=clock_timestamp();
  elsif new.status in ('pending','approved','rejected') then
    if new.pricing_roster_revision<>state.roster_revision or new.pricing_revision<>state.pricing_revision
      or new.preview->'before' is distinct from prices or new.expires_at<=clock_timestamp()
      or private.pricing_roster_identity(new.preview->'roster') is distinct from private.pricing_roster_identity(private.pricing_roster())
      or new.status is distinct from (case when approvals>=3 then 'approved'
        when jsonb_array_length(new.preview->'roster')-rejections<3 then 'rejected' else 'pending' end) then
      raise exception using errcode='42501',message='Pricing status must reflect current distinct votes';
    end if;
  else raise exception using errcode='42501',message='Invalid pricing transition'; end if;
  if new.status<>'executed' and (new.executed_at is not null or new.executed_by_context_id is not null) then
    raise exception using errcode='42501',message='Only founder execution records execution metadata';
  end if;
  new.decided_at:=case when new.status='pending' then null else coalesce(old.decided_at,clock_timestamp()) end;
  return new;
end;
$$;
create trigger pricing_proposal_guard before insert or update or delete on public.admin_proposals
  for each row execute function private.pricing_proposal_guard();
create function private.pricing_proposal_notice() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.kind='pricing' and (tg_op='INSERT' or new.status is distinct from old.status) then
    perform private.pricing_notice(new.id,'pricing_proposal_'||new.status,'Pricing proposal '||new.status,
      case when new.status='executed' then 'Administrator #1 applied the approved pricing. New checkouts use the new prices.'
        when new.status='approved' then 'Three approvals received. Administrator #1 must make the final push; live prices have not changed.'
        else 'Pricing proposal status: '||new.status||'. Open Admin Settings to review the decision.' end);
  end if;
  return null;
end;
$$;
create trigger pricing_proposal_notice after insert or update on public.admin_proposals
  for each row execute function private.pricing_proposal_notice();

create function private.pricing_vote_guard() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals; state private.admin_pricing_state; a uuid;
begin
  if tg_op<>'INSERT' and exists(select 1 from public.admin_proposals where id=old.proposal_id and kind='pricing') then
    raise exception using errcode='42501',message='Pricing votes are immutable';
  end if;
  select * into p from public.admin_proposals where id=case when tg_op='DELETE' then old.proposal_id else new.proposal_id end for update;
  if p.kind<>'pricing' then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op<>'INSERT' then raise exception using errcode='42501',message='Pricing votes are immutable'; end if;
  select * into state from private.admin_pricing_state where singleton for update;
  a:=private.settings_authorized_context();
  if a is null or a is distinct from new.administrator_context_id or p.status not in ('pending','approved')
    or p.expires_at<=clock_timestamp() or p.pricing_roster_revision<>state.roster_revision or p.pricing_revision<>state.pricing_revision
    or not exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=a::text)
    or private.pricing_roster_identity(p.preview->'roster') is distinct from private.pricing_roster_identity(private.pricing_roster()) then
    raise exception using errcode='42501',message='Current administrator settings approval required';
  end if;
  new.decided_at:=clock_timestamp();return new;
end;
$$;
create trigger pricing_vote_guard before insert or update or delete on public.admin_votes
  for each row execute function private.pricing_vote_guard();
create function private.pricing_vote_recorded() returns trigger
language plpgsql set search_path='' as $$
declare p public.admin_proposals; approvals integer; rejections integer;
begin
  select * into p from public.admin_proposals where id=new.proposal_id;
  if p.kind<>'pricing' then return null; end if;
  select count(*) filter(where decision='approved'),count(*) filter(where decision='rejected') into approvals,rejections
    from public.admin_votes where proposal_id=p.id;
  update public.admin_proposals set status=case when approvals>=3 then 'approved'
    when jsonb_array_length(preview->'roster')-rejections<3 then 'rejected' else 'pending' end where id=p.id;
  perform private.pricing_notice(p.id,'pricing_vote_'||new.decision,'Pricing vote '||new.decision,
    'An administrator recorded a '||new.decision||' pricing vote. Open Admin Settings to review the current approvals.');
  return null;
end;
$$;
create trigger pricing_vote_recorded after insert on public.admin_votes
  for each row execute function private.pricing_vote_recorded();

create function private.pricing_roster_changed() returns trigger
language plpgsql set search_path='' as $$
declare changed boolean:=false;
begin
  if tg_table_name='admin_memberships' then
    changed:=tg_op<>'UPDATE' or (new.context_id,new.slot,new.status) is distinct from (old.context_id,old.slot,old.status);
  elsif tg_table_name='account_contexts' then
    if tg_op='INSERT' then changed:=new.kind='admin';
    elsif tg_op='DELETE' then changed:=old.kind='admin';
    else changed:=(new.kind='admin' or old.kind='admin') and
      (new.status,new.kind,new.auth_user_id) is distinct from (old.status,old.kind,old.auth_user_id); end if;
  else
    if tg_op='INSERT' then changed:=new.settings_key_hash is not null;
    elsif tg_op='DELETE' then changed:=old.settings_key_hash is not null;
    else changed:=(new.settings_key_hash,new.settings_key_version) is distinct from (old.settings_key_hash,old.settings_key_version); end if;
  end if;
  if changed then
    update private.admin_pricing_state set roster_revision=roster_revision+1 where singleton;
    update public.admin_proposals set status='invalidated' where kind='pricing' and status in ('pending','approved');
  end if;
  return null;
end;
$$;
create trigger pricing_membership_changed after insert or update or delete on public.admin_memberships
  for each row execute function private.pricing_roster_changed();
create trigger pricing_admin_context_changed after insert or update or delete on public.account_contexts
  for each row execute function private.pricing_roster_changed();
create trigger pricing_settings_key_changed after insert or update or delete on private.admin_secrets
  for each row execute function private.pricing_roster_changed();

create function private.pricing_values_changed() returns trigger
language plpgsql set search_path='' as $$
declare before jsonb; after jsonb; applying uuid; configured text;
begin
  if tg_op='UPDATE' and new.key is distinct from old.key and (new.key='platform' or old.key='platform') then
    raise exception using errcode='42501',message='Platform settings identity is immutable';
  end if;
  if (tg_op='DELETE' and old.key<>'platform') or (tg_op<>'DELETE' and new.key<>'platform') then return null; end if;
  before:=private.pricing_projection(case when tg_op='INSERT' then null else old.value end);
  after:=private.pricing_projection(case when tg_op='DELETE' then null else new.value end);
  if before is distinct from after then
    configured:=current_setting('pinevela.pricing_proposal_id',true);
    if configured ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then applying:=configured::uuid; end if;
    update private.admin_pricing_state set pricing_revision=pricing_revision+1,last_applied_proposal_id=applying where singleton;
    update public.admin_proposals set status='invalidated' where kind='pricing' and status in ('pending','approved')
      and (applying is null or id<>applying);
  end if;
  return null;
end;
$$;
create trigger pricing_values_changed after insert or update or delete on private.platform_settings
  for each row execute function private.pricing_values_changed();

create function private.apply_approved_pricing(proposal uuid) returns jsonb
language plpgsql set search_path='' as $$
declare p public.admin_proposals; state private.admin_pricing_state; a uuid; current_prices jsonb; approvals integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('platform-settings',0));
  select * into state from private.admin_pricing_state where singleton for update;
  a:=private.settings_authorized_context();
  if a is null or not exists(select 1 from public.admin_memberships where context_id=a and slot=1 and status='active') then
    raise exception using errcode='42501',message='Founder settings authorization required';
  end if;
  -- Hold all effective membership/context/key rows until execution commits.
  perform m.context_id from public.admin_memberships m join public.account_contexts c on c.id=m.context_id
    join private.admin_secrets k on k.context_id=m.context_id where m.status='active' and c.status='active' and c.kind='admin'
    order by m.slot for share of m,c,k;
  select * into p from public.admin_proposals where id=proposal and kind='pricing' for update;
  insert into private.platform_settings(key,value) values('platform','{}') on conflict do nothing;
  select private.pricing_projection(value) into current_prices from private.platform_settings where key='platform' for update;
  select count(*) into approvals from public.admin_votes v join public.admin_memberships m on m.context_id=v.administrator_context_id
    join public.account_contexts c on c.id=m.context_id join private.admin_secrets k on k.context_id=m.context_id
    where v.proposal_id=proposal and v.decision='approved' and m.status='active' and c.kind='admin' and c.status='active'
      and k.settings_key_hash is not null and exists(select 1 from jsonb_array_elements(p.preview->'roster') r where r->>'id'=m.context_id::text);
  if p.id is null or p.status<>'approved' or p.quorum<>3 or approvals<3 or approvals>5 or not private.pricing_roster_ready()
    or p.expires_at<=clock_timestamp() or p.pricing_roster_revision<>state.roster_revision or p.pricing_revision<>state.pricing_revision
    or p.preview->'before' is distinct from current_prices or private.pricing_roster_identity(p.preview->'roster') is distinct from private.pricing_roster_identity(private.pricing_roster())
    or not private.valid_pricing(p.preview->'prices') then
    raise exception using errcode='42501',message='Three current approvals and an unchanged pricing baseline required';
  end if;
  perform set_config('pinevela.pricing_proposal_id',proposal::text,true);
  update private.platform_settings set value=value||(p.preview->'prices'),updated_by_context_id=a,updated_at=clock_timestamp() where key='platform';
  update public.admin_proposals set status='executed',executed_by_context_id=a where id=proposal;
  perform set_config('pinevela.pricing_proposal_id','',true);
  return p.preview->'prices';
end;
$$;
-- Browser roles and the ordinary RLS role cannot invoke privileged pricing writes.
revoke all on public.admin_proposals,public.admin_votes from anon;
revoke insert,update,delete,truncate,references,trigger on public.admin_proposals,public.admin_votes from authenticated,pinevela_backend;
revoke all on function private.pricing_projection(jsonb),private.valid_pricing(jsonb),private.pricing_roster(),
  private.pricing_roster_ready(),private.pricing_roster_identity(jsonb),private.settings_authorized_context(),private.pricing_notice(uuid,text,text,text),
  private.pricing_proposal_guard(),private.pricing_proposal_notice(),private.pricing_vote_guard(),private.pricing_vote_recorded(),
  private.pricing_roster_changed(),private.pricing_values_changed(),private.apply_approved_pricing(uuid)
  from public,anon,authenticated,pinevela_backend;
