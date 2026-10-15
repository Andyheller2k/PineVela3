/** Operator-only, read-only dependency planning. This is not execution authority.
 * Never turn these advisory effects into SQL supplied by a browser or CLI input. */
import type {PoolClient} from 'pg';
import crypto from 'node:crypto';
import {ApiError,uuid,type SupabaseDatabase} from '../../supabase/db.js';
import {wipeScopes} from '../../supabase/systemWipeReviews.js';
import {canonical} from '../../supabase/storageBackup.js';

type Effect={table:string;ids:string[];transition:string;historyRetained:boolean};
type Blocker={code:string;table?:string;ids?:string[];count?:number};
const digest=(value:unknown)=>crypto.createHash('sha256').update(canonical(value)).digest('hex');

/** The entire plan must describe one native snapshot, with writes prohibited by
 * PostgreSQL itself. No auth claims, admin keys, file proof or client ownership. */
export async function inspectSystemWipeClosure(c:PoolClient,requested:unknown,proposalId?:string){
 const mode=(await c.query(`select current_setting('transaction_read_only') as readonly,
  current_setting('transaction_isolation') as isolation,current_setting('role') as role`)).rows[0];
 if(mode.readonly!=='on'||mode.isolation!=='repeatable read'||mode.role!=='none')
  throw new ApiError(409,'Closure planning requires an operator read-only repeatable-read snapshot.');
 const scopes=wipeScopes(requested);
 const native=(await c.query(`select private.system_wipe_preview($1::jsonb)as preview,
  private.residence_recovery_catalog_digest()as catalog_digest,
  (select roster_revision from private.admin_pricing_state where singleton)as roster_revision`,[JSON.stringify(scopes)])).rows[0];
 const preview=native.preview;
 if(preview.version!==1||preview.executionAvailable!==false)throw new ApiError(409,'Review this planner against the current wipe protocol first.');
 const fingerprint=(await c.query('select private.system_wipe_digest($1::jsonb,$2::bigint)as digest',[JSON.stringify(preview),native.roster_revision])).rows[0].digest;
 let review:null|{id:string;current:boolean;quorum:boolean;status:string;founderDecision:string|null}=null;
 if(proposalId){
  const p=(await c.query(`select id,preview,baseline_digest,status,wipe_final_decision,
   private.system_wipe_current(p)as current,private.system_wipe_quorum(p.id)as quorum
   from public.admin_proposals p where id=$1 and kind='system_wipe'`,[uuid(proposalId)])).rows[0];
  if(!p||!p.current||p.baseline_digest!==fingerprint||canonical(p.preview)!==canonical(preview))
   throw new ApiError(409,'The saved wipe review does not match this exact current scope.');
  review={id:p.id,current:p.current,quorum:p.quorum,status:p.status,founderDecision:p.wipe_final_decision};
 }
 const resources:Record<string,string[]>=preview.resources;
 const ids=(table:string)=>resources[table]||[];
 const contexts=ids('account_contexts'),homes=ids('residences'),stores=ids('stores'),rooms=ids('rooms');
 const effects:Effect[]=[],blockers:Blocker[]=[];
 const add=(table:string,rows:{id:string}[],transition:string,historyRetained=true)=>{
  if(rows.length)effects.push({table,ids:rows.map(r=>r.id).sort(),transition,historyRetained});
 };
 // Queries deliberately use saved relation IDs. Shared mailbox identities are
 // not expanded into other portals and never count as proof of ownership.
 const portals=(await c.query('select id,kind from public.account_contexts where id=any($1::uuid[]) order by id',[contexts])).rows;
 if(portals.some(r=>r.kind==='admin'))throw new ApiError(409,'An administrator portal cannot be a closure target.');
 add('public.account_contexts',portals,'status -> closed');
 add('public.residences',homes.map(id=>({id})),'status -> closed');
 add('public.stores',stores.map(id=>({id})),'status -> closed');
 const targets:[string,string,string,string[]][]=[
  ['manager_assignments','ended_at is null','ended_at -> execution timestamp',ids('manager_assignments')],
  ['staff_assignments','ended_at is null','status -> removed; ended_at -> execution timestamp',ids('staff_assignments')],
  ['listings','is_published','is_published -> false',ids('listings')],
  ['store_subscriptions',"status='active'",'status -> cancelled',ids('store_subscriptions')],
  ['meetings',"status in ('requested','accepted')",'status -> cancelled',ids('meetings')],
  ['staff_bargains',"status in ('proposed','declined')",'status -> cancelled',ids('staff_bargains')],
  ['residence_change_requests',"status='pending'",'status -> invalidated',ids('residence_change_requests')],
 ];
 for(const[table,predicate,transition,selected]of targets){
  // Both identifiers and predicates come exclusively from the static list above.
  add('public.'+table,(await c.query(`select id from public.${table} where id=any($1::uuid[]) and ${predicate} order by id`,[selected])).rows,transition);
 }
 // A reviewed room can contain another resident's retained historical records.
 // Resource membership alone never authorizes ending its sibling relationships.
 add('public.allocations',(await c.query(`select a.id from public.allocations a
  join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
  where a.id=any($1::uuid[])and a.ended_at is null
   and(a.resident_context_id=any($2::uuid[])or b.residence_id=any($3::uuid[]))order by a.id`,
  [ids('allocations'),contexts,homes])).rows,'ended_at -> execution timestamp');
 add('public.maintenance_issues',(await c.query(`select id from public.maintenance_issues
  where id=any($1::uuid[])and status not in('closed','resident_confirmed')
   and(reporter_context_id=any($2::uuid[])or residence_id=any($3::uuid[]))order by id`,
  [ids('maintenance_issues'),contexts,homes])).rows,'withdraw operational access; retain repair and resident-confirmation evidence');
 add('private.room_activation_keys',(await c.query(`select k.id from private.room_activation_keys k
  join public.rooms r on r.id=k.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
  where k.revoked_at is null and(b.residence_id=any($1::uuid[])or k.claimed_by=any($2::uuid[]))order by k.id`,
  [homes,contexts])).rows,'revoked_at -> execution timestamp');
 const enrollments=(await c.query(`select id from private.account_enrollments e where status in('pending_email','pending_review')
  and private.system_wipe_enrollment_selected(e,$1::jsonb)order by id`,[JSON.stringify(preview)])).rows;
 add('private.account_enrollments',enrollments,'status -> cancelled');
 const bindingCounts=(await c.query(`select active_context_id as context_id,count(*)::integer as count from private.account_sessions
  where active_context_id=any($1::uuid[]) group by active_context_id order by active_context_id`,[contexts])).rows;
 // Session UUIDs and key values must never be exported to the plan.
 const managerKeys=(await c.query(`select manager_context_id as id from private.manager_operation_keys
  where manager_context_id=any($1::uuid[]) and key_hash is not null order by manager_context_id`,[contexts])).rows;
 add('private.manager_operation_keys',managerKeys,'invalidate manager operation grant; retain version history');

 // Identify dependencies that an execution routine must not silently omit just
 // because an old preview forgot one of its relationship directions.
 const relatedMeetings=(await c.query(`select id from public.meetings where status in('requested','accepted') and
  (residence_id=any($2::uuid[])or requested_by_context_id=any($1::uuid[])or manager_context_id=any($1::uuid[])
   or participant_context_id=any($1::uuid[])or allocation_id=any($3::uuid[])or staff_assignment_id=any($4::uuid[]))order by id`,
   [contexts,homes,ids('allocations'),ids('staff_assignments')])).rows;
 const missingMeetings=relatedMeetings.filter(r=>!ids('meetings').includes(r.id));
 if(missingMeetings.length)blockers.push({code:'unreviewed_meeting_dependencies',table:'public.meetings',ids:missingMeetings.map(r=>r.id)});
 for(const[key,value]of Object.entries(preview.obligations))if(Number(value)>0)blockers.push({code:key,count:Number(value)});
 const pendingMedia=(await c.query("select id from public.media_assets where id=any($1::uuid[])and state in('reserved','removing')order by id",[ids('media_assets')])).rows;
 if(pendingMedia.length)blockers.push({code:'unfinished_media_operations',table:'public.media_assets',ids:pendingMedia.map(r=>r.id)});
 const pendingProof=(await c.query(`select id from private.account_enrollments where id=any($1::uuid[])
  and status='pending_email'and expires_at>clock_timestamp() order by id`,[enrollments.map(r=>r.id)])).rows;
 if(pendingProof.length)blockers.push({code:'active_email_verification',table:'private.account_enrollments',ids:pendingProof.map(r=>r.id)});

 // These are explicit implementation gaps, not permission to relax constraints.
 const primary=portals.filter(r=>r.kind==='primary').map(r=>r.id),sellers=portals.filter(r=>r.kind==='seller').map(r=>r.id);
 const primaryExecutor=(await c.query("select to_regprocedure('private.run_primary_wipe(uuid)')is not null as present")).rows[0].present;
 const primaryScopeSupported=primaryExecutor&&primary.length>0&&primary.length===portals.length
  &&scopes.length===1&&['users','total'].includes(scopes[0])
  &&Object.entries(resources).every(([table,values])=>['account_contexts','profiles','media_assets'].includes(table)||values.length===0);
 if(primary.length&&!primaryExecutor)blockers.push({code:'primary_closure_and_verified_reentry_required',table:'public.account_contexts',ids:primary});
 else if(primary.length&&!primaryScopeSupported)blockers.push({code:'operational_scope_closure_required',table:'public.account_contexts',ids:primary});
 const unavailableReentry=(await c.query(`select c.id from public.account_contexts c where c.id=any($1::uuid[])
  and not private.primary_reentry_identity_supported(c.auth_user_id,'verified-email-reentry') order by c.id`,[primary])).rows;
 if(unavailableReentry.length)blockers.push({code:'verified_primary_reentry_unavailable',table:'public.account_contexts',ids:unavailableReentry.map(r=>r.id)});
 const sellerReentryImplemented=(await c.query("select to_regprocedure('private.guard_seller_reactivation()')is not null as present")).rows[0].present;
 if(sellers.length)blockers.push({code:sellerReentryImplemented?'seller_scope_closure_required':'seller_generation_and_verified_reentry_required',table:'public.account_contexts',ids:sellers});
 const pendingInspections=(await c.query(`select id from public.verification_cases where id=any($1::uuid[])
  and status in('submitted','inspection_pending','under_review','more_info_required') order by id`,[ids('verification_cases')])).rows;
 if(pendingInspections.length)blockers.push({code:'retained_inspection_closure_required',table:'public.verification_cases',ids:pendingInspections.map(r=>r.id)});
 const constraints=(await c.query(`select n.nspname||'.'||t.relname as table_name,k.conname as name,pg_get_constraintdef(k.oid)as definition
  from pg_constraint k join pg_class t on t.oid=k.conrelid join pg_namespace n on n.oid=t.relnamespace
  where k.conrelid in('public.account_contexts'::regclass,'public.seller_applications'::regclass,'public.stores'::regclass)
   and k.contype in('c','u') order by table_name,name`)).rows;
 const plan={version:1,executionAvailable:false,authorizesMutation:false,sellerReentryImplemented,primaryNativeScopeSupported:primaryScopeSupported&&unavailableReentry.length===0,scopes,review,fingerprint,
  resourceRevision:preview.resourceRevision,catalogDigest:native.catalog_digest,
  effects,applicationBindingsToRevoke:bindingCounts,blockers,
  retained:{authIdentities:true,nativeAuthSessions:true,administratorPortals:true,administratorKeys:true,
   profiles:true,payments:true,orders:true,reviews:true,notifications:true,governance:true,storageBytes:true,
   resourceIds:resources,dependencies:preview.retainedDependencies},constraints,
  prerequisites:['native_atomic_closure_protocol','fresh_exact_recovery_verification','current_five_admin_and_founder_consent',
   'transaction_bound_write_admission','affected_account_notices','verified_retained_portal_reentry']};
 return{...plan,planDigest:digest(plan)};
}

export async function planSystemWipeClosure(db:SupabaseDatabase,scopes:unknown,proposalId?:string){
 const c=await db.pool.connect();let discard=false;
 try{await c.query('begin isolation level repeatable read read only');
  const plan=await inspectSystemWipeClosure(c,scopes,proposalId);await c.query('commit');return plan;
 }catch(error){try{await c.query('rollback');}catch{discard=true;}throw error;}
 finally{c.release(discard);}
}
