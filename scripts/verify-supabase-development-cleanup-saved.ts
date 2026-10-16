/** Read-only post-execution acceptance for the single reviewed development
 * property. Restores the genuine recovery archive locally; never submits a
 * request, changes a cloud record, creates an actor or supplies a private key. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dotenv from 'dotenv';
import type {PoolClient} from 'pg';
import {SupabaseDatabase} from '../supabase/db.js';
import {canonical,readPrivateRecoveryFile,readStorageSnapshot,storageSnapshotDigest} from '../supabase/storageBackup.js';
import {withIsolatedBackup} from './lib/isolated-postgres.js';

dotenv.config({quiet:true});
if(process.argv.length!==2)throw Error('This verifier accepts no selectors; it checks only the prepared development cleanup.');
const directory='.security/migration-reset',proposalId='ff3422df-725b-4220-b958-64dba1fb8c94',checkpoint='ebd5a53c-e4d5-4be2-8b0d-fd31bbf3c017';
const expectedResources={
 residences:['d0926a16-574f-4372-9803-42ffacbbc1af'],
 manager_assignments:['9dd44fd3-254d-432b-9619-ebf835ad47d5'],
 verification_cases:['98dacb17-2bdd-4b1d-b8e4-d15307282e6c'],
 verification_inspections:['9950db54-9afd-4564-b64f-0570055c41ce'],
};
const historicalTables=[
 ['private.audit_events','id'],['private.residence_history_targets','residence_id'],
 ['private.housing_reference_targets','id'],['private.residence_payment_references','residence_id'],
 ['public.admin_votes','proposal_id,administrator_context_id'],['public.payments','id'],
 ['private.residence_recovery_evidence','preparation_id'],['private.residence_cleanup_plans','preparation_id'],
] as const;
let checks=0,stage='reviewed preflight';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const jsonEqual=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const historySql=historicalTables.map(([table,columns])=>{
 const key=columns.split(',').map(column=>`'${column}',t.${column}`).join(',');
 return `select '${table}'::text as relation,jsonb_build_object(${key}) as key,md5(to_jsonb(t)::text) as digest from ${table} t`;
}).join(' union all ');
type Saved={identities:string[];providerIdentities:string[];profileIds:string[];contextIds:string[];manager:any;history:{relation:string;key:any;digest:string}[];storageDigest:string;storageObjects:number;storageAssets:number;targetCounts:Record<string,number>;scopedContexts:any[];scopedProfiles:string[];enrollments:any[];state?:any};
async function readSaved(c:PoolClient,preflight:any,current:boolean):Promise<Saved>{
 const countsSql=Object.entries(expectedResources).map(([table,ids])=>`'${table}',(select count(*) from public.${table} where id=any($4::uuid[]) and id='${ids[0]}'::uuid)`).join(',');
 const base=(await c.query(`select jsonb_build_object(
  'identities',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.users),
  'providerIdentities',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.identities),
  'profileIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from public.profiles),
  'contextIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from public.account_contexts),
  'manager',(select jsonb_build_object('id',x.id,'authUserId',x.auth_user_id,'kind',x.kind,'status',x.status,
   'keyDigest',md5(k.key_hash),'keyVersion',k.version,
   'boundSessionCount',(select count(*) from private.account_sessions s where s.auth_user_id=x.auth_user_id and s.active_context_id=x.id),
   'providerSessionCount',(select count(*) from auth.sessions live where live.user_id=x.auth_user_id),
   'bindingExists',exists(select 1 from private.account_sessions s join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
    where s.active_context_id=x.id and s.auth_user_id=x.auth_user_id and(live.not_after is null or live.not_after>clock_timestamp())))
   from public.account_contexts x join private.manager_operation_keys k on k.manager_context_id=x.id where x.id=$1),
  'targetCounts',jsonb_build_object(${countsSql}),
  'scopedContexts',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'authUserId',x.auth_user_id,'kind',x.kind,'status',x.status) order by x.id),'[]') from public.account_contexts x where x.id=any($2::uuid[])),
  'scopedProfiles',(select coalesce(jsonb_agg(id::text order by id),'[]') from public.profiles where id=any($3::uuid[])),
  'enrollments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'linkedContextId',linked_context_id) order by id),'[]') from private.account_enrollments where id=any($5::uuid[]))) as saved`,
  [preflight.retained.id,preflight.preview.resources.account_contexts,preflight.preview.resources.profiles,Object.values(expectedResources).flat(),preflight.preview.resources.account_enrollments])).rows[0].saved;
 const history=(await c.query(historySql)).rows;
 const storage=await readStorageSnapshot(c);
 const result:Saved={...base,history,storageDigest:storageSnapshotDigest(storage),storageObjects:storage.objects.length,storageAssets:storage.assets.length};
 if(current)result.state=(await c.query(`select jsonb_build_object(
  'executions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'authorizationId',authorization_id,'preparationId',preparation_id,'proposalId',proposal_id,
   'founderId',founder_context_id,'state',state,'completedAt',completed_at,'resources',resources,'accounts',accounts,'deleteManager',delete_manager,'cooldown',cooldown)),'[]') from private.residence_executions where proposal_id=$1),
  'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'authorizationId',authorization_id,'proposalId',proposal_id,'founderId',founder_context_id,
   'state',state,'executionId',execution_id,'finishedAt',finished_at,'failureCode',failure_code)),'[]') from private.residence_execution_requests where proposal_id=$1),
  'proposal',(select jsonb_build_object('id',id,'kind',kind,'status',status,'executedAt',executed_at,'executedBy',executed_by_context_id,'preview',preview) from public.admin_proposals where id=$1),
  'preparation',(select jsonb_build_object('id',id,'state',state,'proposalId',proposal_id,'executionId',executed_execution_id,'executedAt',executed_at) from private.residence_deletion_preparations where proposal_id=$1),
  'recovery',(select jsonb_build_object('checkpoint',checkpoint_id,'storageArchive',storage_archive_id) from private.residence_recovery_evidence where preparation_id=$2),
  'cleanupPlan',(select plan from private.residence_cleanup_plans where preparation_id=$2),
  'cleanupTasks',(select count(*) from private.residence_storage_cleanup_tasks t join private.residence_executions e on e.id=t.execution_id where e.proposal_id=$1),
  'registrationBans',(select count(*) from public.registration_bans where proposal_id=$1),
  'completionAudit',(select count(*) from private.audit_events a join private.residence_executions e on e.id=a.resource_id where e.proposal_id=$1 and a.event_type='residence_deleted'
   and a.actor_context_id=e.founder_context_id and a.resource_type='residence_execution'),
  'managerCompletionNotice',exists(select 1 from public.notifications n join public.notification_recipients r on r.notification_id=n.id
   where r.context_id=$3 and n.title='Residence deleted' and n.message like $4 and n.created_at>=$5::timestamptz)) as state`,
  [proposalId,preflight.pause.id,preflight.retained.id,preflight.preview.hostelName+'%',preflight.verifiedAt])).rows[0].state;
 return result;
}
try{
 const preflight=JSON.parse(readPrivateRecoveryFile(directory+'/development-cleanup-final-preflight.json',4*1024*1024).toString());
 check(preflight.proposalId===proposalId&&preflight.recovery.checkpoint_id===checkpoint&&preflight.pause.id===preflight.plan.plan.preparationId,
  'Reviewed preflight matches the exact property-only proposal and genuine recovery checkpoint');
 check(preflight.preview.options.deleteHostel===true&&preflight.preview.options.deleteManager===false&&preflight.preview.options.ban.amount===0,
  'Reviewed scope retains manager sign-in without a registration ban');
 for(const [table,ids]of Object.entries(expectedResources))check(jsonEqual(preflight.preview.resources[table],ids),'Reviewed exact '+table+' deletion list matches the prepared development case');
 check(preflight.preview.uploads.length===0&&preflight.plan.plan.removeCount===0&&preflight.plan.plan.removeBytes===0,
  'Reviewed cleanup scope removes no Storage objects');
 let archived:Saved|undefined;stage='genuine archived baseline';
 await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);try{archived=await db.system(async c=>{
   await c.query('set transaction isolation level repeatable read read only');return readSaved(c,preflight,false);
  });}finally{await db.close();}
 });
 check(!!archived&&jsonEqual(archived.identities,[...preflight.identities].sort()),'Archived Auth identity set matches reviewed preflight');
 for(const table of Object.keys(expectedResources))check(archived!.targetCounts[table]===1,'Genuine archived '+table+' row exists before execution');
 check(archived!.manager?.id===preflight.retained.id&&archived!.manager.authUserId===preflight.retained.auth_user_id
  &&archived!.manager.keyDigest===preflight.retained.key_digest&&String(archived!.manager.keyVersion)===String(preflight.retained.version),
 'Archived real manager and private operation-key digest/version match preflight');
 stage='current saved read-only transaction';
 const live=new SupabaseDatabase();let current:Saved;
 try{current=await live.system(async c=>{await c.query('set transaction isolation level repeatable read read only');return readSaved(c,preflight,true);});}
 finally{await live.close();}
 const state=current.state;
 for(const table of Object.keys(expectedResources))check(current.targetCounts[table]===0,'Exact reviewed '+table+' row is absent');
 check(state.executions.length===1,'Exactly one native execution exists for this proposal');const execution=state.executions[0];
 check(execution.state==='completed'&&!!execution.completedAt&&execution.proposalId===proposalId&&execution.preparationId===preflight.pause.id
  &&execution.founderId===preflight.pause.founderId&&execution.deleteManager===false&&execution.cooldown===null,
 'Native completed execution retains founder, preparation and property-only scope');
 check(jsonEqual(execution.resources,preflight.preview.resources)&&jsonEqual(execution.accounts,preflight.preview.accounts),
  'Completed execution preserves the exact reviewed resource and retained-account lists');
 const completedRequests=state.requests.filter((request:any)=>request.state==='completed');
 check(completedRequests.length===1&&!state.requests.some((request:any)=>request.state==='requested'),
  'Exactly one completed request exists and no request remains queued for this proposal');
 const request=completedRequests[0];
 check(request.executionId===execution.id&&request.authorizationId===execution.authorizationId&&request.founderId===execution.founderId
  &&!!request.finishedAt&&request.failureCode===null,'Native request links the exact completed execution and authorization');
 check(state.proposal?.status==='executed'&&state.proposal.kind==='residence_deletion'&&state.proposal.executedBy===execution.founderId
  &&!!state.proposal.executedAt&&jsonEqual(state.proposal.preview,preflight.preview),'Saved proposal records the completed reviewed scope');
 check(state.preparation?.state==='executed'&&state.preparation.id===preflight.pause.id&&state.preparation.executionId===execution.id
  &&!!state.preparation.executedAt,'Reviewed frozen preparation is released only through its completed execution');
 check(state.recovery?.checkpoint===checkpoint&&state.recovery.storageArchive===preflight.recovery.storage_archive_id
  &&jsonEqual(state.cleanupPlan,preflight.plan.plan),'Matching recovery evidence and exact cleanup plan remain saved');
 check(state.registrationBans===0&&state.cleanupTasks===0,'No registration ban or Storage cleanup task was introduced');
 check(jsonEqual(current.identities,archived!.identities)&&jsonEqual(current.identities,[...preflight.identities].sort()),
  'Every genuine Auth user ID remains with no added or deleted identity');
 check(jsonEqual(current.providerIdentities,archived!.providerIdentities),'Every original provider identity ID remains');
 const manager=current.manager;
 check(manager?.id===preflight.retained.id&&manager.authUserId===preflight.retained.auth_user_id&&manager.kind==='manager'&&manager.status==='active',
  'The real manager retains the same active portal and Auth subject');
 check(manager.keyDigest===preflight.retained.key_digest&&String(manager.keyVersion)===String(preflight.retained.version)
  &&manager.keyDigest===archived!.manager.keyDigest&&String(manager.keyVersion)===String(archived!.manager.keyVersion),
 'Private manager operation-key digest and version remain unchanged');
 if(archived!.manager.bindingExists===true)
  check(manager.bindingExists===true,'A previously existing real manager session remains bound to its own subject and active context');
 else check(archived!.manager.boundSessionCount===0&&archived!.manager.providerSessionCount===0,
  'Genuine pre-execution archive had no manager binding or provider session to retain; no login is fabricated');
 check(archived!.profileIds.every(id=>current.profileIds.includes(id))&&archived!.contextIds.every(id=>current.contextIds.includes(id)),
  'Every original profile and account context remains');
 check(jsonEqual(current.scopedProfiles,archived!.scopedProfiles)&&jsonEqual(current.scopedContexts,archived!.scopedContexts),
  'Both reviewed profiles and account contexts retain their existing identities and statuses');
 check(jsonEqual(current.enrollments,archived!.enrollments)&&current.enrollments.every(enrollment=>enrollment.status==='completed'),
  'Completed genuine enrollment remains completed and linked to its saved portal');
 const currentHistory=new Map(current.history.map(row=>[row.relation+':'+canonical(row.key),row.digest]));
 for(const [table]of historicalTables)check(archived!.history.filter(row=>row.relation===table)
  .every(row=>currentHistory.get(row.relation+':'+canonical(row.key))===row.digest),
 'Original '+table+' rows remain byte-equivalent while new audit history may append');
 check(state.completionAudit===1&&state.managerCompletionNotice===true,'Exactly one native deletion audit event and the real retained-manager notice are saved');
 check(current.storageDigest===archived!.storageDigest&&current.storageObjects===archived!.storageObjects&&current.storageAssets===archived!.storageAssets,
  'Complete Storage catalog and media metadata remain exact against the verified archive');
 const result={passed:true,checks,verifiedAt:new Date().toISOString(),proposalId,executionId:execution.id,
  genuineArchivedCheckpoint:checkpoint,readOnly:true,exactHousingRowsRemoved:4,managerActive:true,managerOperationKeyPreserved:true,
  archivedManagerSessionAvailable:archived!.manager.bindingExists===true,currentManagerSessionAvailable:manager.bindingExists===true,
  originalAuthUsersRetained:current.identities.length,providerIdentityIdsRetained:true,originalHistoryRowsRetained:archived!.history.length,
  registrationBansAdded:0,storageCleanupTasksCreated:0,storageCatalogUnchanged:true,storageObjectsRetained:current.storageObjects,
  cloudRecordsModifiedByVerifier:0,providerRepliesMocked:false,sessionsFabricated:false,
  limits:['Storage metadata compared with the genuine archive; provider object bytes were not downloaded again.',
   manager.bindingExists===true?'A real existing manager binding was observed; no authentication token was fabricated or replayed.'
    :'No manager binding or provider session existed in the genuine pre-execution archive, and none exists now; a new genuine sign-in is still needed for browser acceptance.',
   'Auth user and provider identity ID sets were compared; mutable authentication session timestamps were not required to remain identical.']};
 fs.writeFileSync(directory+'/development-cleanup-saved-verification.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}catch(error:any){
 fs.writeFileSync(directory+'/development-cleanup-saved-verification-failure.log',String(error.stack||error),{mode:0o600});
 console.error(JSON.stringify({passed:false,stage,checks,code:/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:undefined,
  error:error instanceof assert.AssertionError?error.message:'Saved cleanup verification did not complete; diagnostics saved privately.'}));process.exitCode=1;
}
