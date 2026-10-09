-- Narrow account-scoped projections for the existing housing dashboard. These
-- are authenticated views, never a public staff directory or generic feed.
create view public.housing_staff_directory with (security_barrier = true) as
select s.id,s.staff_context_id,s.residence_id,s.assigned_block_id,s.status,s.created_at,s.ended_at,
  p.display_name,p.email,p.phone,p.avatar_path,h.name as residence_name,b.name as block_name
from public.staff_assignments s join public.account_contexts c on c.id = s.staff_context_id
join public.profiles p on p.id = c.auth_user_id join public.residences h on h.id = s.residence_id
left join public.blocks b on b.id = s.assigned_block_id
where private.current_context_id() is not null and (
  private.can_manage_residence(s.residence_id) or s.staff_context_id = private.current_context_id() or
  (private.current_kind() = 'resident' and s.status = 'active' and s.ended_at is null and private.has_residence_access(s.residence_id)));

create view public.housing_issue_details with (security_barrier = true) as
select i.*,h.name as residence_name,r.room_number,b.name as block_name,
  p.display_name as reporter_name,sp.display_name as staff_name
from public.maintenance_issues i join public.residences h on h.id = i.residence_id
join public.account_contexts c on c.id = i.reporter_context_id join public.profiles p on p.id = c.auth_user_id
left join public.rooms r on r.id = i.room_id left join public.floors f on f.id = r.floor_id
left join public.blocks b on b.id = f.block_id left join public.staff_assignments s on s.id = i.assigned_staff_id
left join public.account_contexts sc on sc.id = s.staff_context_id left join public.profiles sp on sp.id = sc.auth_user_id
where private.current_context_id() is not null and (i.reporter_context_id = private.current_context_id()
  or private.can_manage_residence(i.residence_id) or (s.staff_context_id = private.current_context_id()
    and s.status = 'active' and s.ended_at is null));

create view public.housing_bargain_details with (security_barrier = true) as
select v.id,v.staff_assignment_id,v.manager_context_id,v.proposed_terms,v.status,v.created_at,v.updated_at,
  s.staff_context_id,s.residence_id,p.display_name as staff_name,p.email as staff_email,p.phone as staff_phone,
  h.name as residence_name,b.name as block_name
from public.staff_bargains v join public.staff_assignments s on s.id = v.staff_assignment_id
join public.account_contexts c on c.id = s.staff_context_id join public.profiles p on p.id = c.auth_user_id
join public.residences h on h.id = s.residence_id left join public.blocks b on b.id = s.assigned_block_id
where private.current_context_id() is not null and (private.current_kind() = 'admin'
  or (v.manager_context_id = private.current_context_id() and private.can_manage_residence(s.residence_id))
  or s.staff_context_id = private.current_context_id());

create view public.account_activity_feed with (security_barrier = true) as
select a.id,a.event_type,a.resource_type,a.resource_id,a.occurred_at
from private.audit_events a where private.current_context_id() is not null
  and (a.actor_context_id = private.current_context_id() or private.current_kind() = 'admin');
revoke all on public.housing_staff_directory,public.housing_issue_details,
  public.housing_bargain_details,public.account_activity_feed from public,anon;
grant select on public.housing_staff_directory,public.housing_issue_details,
  public.housing_bargain_details,public.account_activity_feed to authenticated,pinevela_backend;
