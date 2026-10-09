/** Real PostgreSQL/RLS retention and review checks on existing verified subjects.
 * Application fixtures, pending DDL and session bindings roll back. No provider
 * signup, fake Auth response, email, payment, imported account or production seed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import { createStaffBargain,respondStaffBargain,decideStaffBargain,createStaffReview,staffReviews } from '../supabase/staffRetention.js';
import { editStaff } from '../supabase/staff.js';
import { housingDashboardRows } from '../supabase/dashboardReads.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),c=await db.pool.connect();let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'staff_workflow_checks',checks}));};
try {
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from public.profiles) as profiles,(select count(*) from auth.users) as users,
    (select count(*) from auth.sessions) as sessions,(select count(*) from public.staff_reviews) as reviews,(select count(*) from public.staff_bargains) as bargains,
    (select count(*) from private.audit_events) as audit,(select count(*) from public.notifications) as notifications`)).rows[0];
  const before=await counts();if(before.profiles!=='0')throw new Error('Run before operational profiles exist.');
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const f of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()) {
    const sql=fs.readFileSync(path.join('supabase/migrations',f),'utf8');
    if(ledger.has(f.slice(0,14)))assert.equal(ledger.get(f.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await c.query(sql);
  }
  const subjects=(await c.query(`select distinct on(u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 4`)).rows;
  if(subjects.length!==4)throw new Error('Four existing verified identities required.');
  const [root,other,child,otherChild]=subjects;
  for(const p of subjects)await c.query('insert into public.profiles(id,email,display_name) values ($1,$2,$3)',[p.id,p.email,p.raw_user_meta_data?.full_name || p.raw_user_meta_data?.name || '']);
  for(const [r,ch] of [[root,child],[other,otherChild]])await c.query('update public.profiles set primary_owner_id=$1 where id=$2',[r.id,ch.id]);
  async function context(p:any,kind:string,owner?:any):Promise<VerifiedActor>{const id=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$2,$3,'active') returning id",[p.id,owner?.id || null,kind])).rows[0].id;return {authUserId:p.id,sessionId:p.session_id,contextId:id,kind};}
  const primary=await context(root,'primary'),manager=await context(child,'manager',root),foreignManager=await context(otherChild,'manager',other),
    resident=await context(child,'resident',root),foreignResident=await context(otherChild,'resident',other),staff=await context(root,'staff'),foreignStaff=await context(other,'staff');
  async function home(r:any,m:VerifiedActor,res:VerifiedActor,s:VerifiedActor) {
    const id=(await c.query("insert into public.residences(primary_owner_id,name,status) values ($1,$2,'approved') returning id",[r.id,r.raw_user_meta_data?.full_name || r.email])).rows[0].id;
    await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)',[m.contextId,id]);
    const block=(await c.query('insert into public.blocks(residence_id,name) values ($1,$2) returning id,name',[id,r.email])).rows[0];
    const floor=(await c.query('insert into public.floors(block_id,floor_number) values ($1,0) returning id',[block.id])).rows[0].id;
    const room=(await c.query("insert into public.rooms(floor_id,room_number) values ($1,'1') returning id",[floor])).rows[0].id;
    const bed=(await c.query('insert into public.beds(room_id,bed_number) values ($1,1) returning id',[room])).rows[0].id;
    const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3) returning id',[res.contextId,room,bed])).rows[0].id;
    const assignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id) values ($1,$2,$3,$4) returning id',[s.contextId,id,m.contextId,block.id])).rows[0].id;
    return {id,block,allocation,assignment};
  }
  const own=await home(root,manager,resident,staff),foreign=await home(other,foreignManager,foreignResident,foreignStaff);
  async function bind(a:VerifiedActor){await c.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
    on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);await claims(a);}
  async function claims(a:VerifiedActor){await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
  async function scoped(a:VerifiedActor,work:()=>Promise<any>){await bind(a);await c.query('set local role pinevela_backend');try{return await work();}finally{await c.query('reset role');}}
  async function denied(work:()=>Promise<unknown>,status:number|string,label:string){await c.query('savepoint negative');let e:any;try{await work();}catch(err){e=err;}await c.query('rollback to savepoint negative');check(typeof status==='number'?e instanceof ApiError && e.status===status:e?.code===status,label);}
  const input={reasonToQuit:'Employment retention workflow verification',isBargain:true,bargainProposal:{type:'custom',title:'Retention workflow verification',proposedTerms:'Review current employment terms',notes:''}};
  await denied(()=>createStaffBargain(c,primary,input),403,'Primary portal cannot impersonate staff');
  await denied(()=>createStaffBargain(c,manager,input),403,'Manager cannot propose for staff');
  await denied(()=>createStaffBargain(c,staff,{...input,staffId:foreignStaff.contextId}),400,'Spoofed staff ownership rejected');
  await denied(()=>createStaffBargain(c,staff,{...input,managerId:foreignManager.contextId}),400,'Spoofed manager recipient rejected');
  await denied(()=>createStaffBargain(c,staff,{...input,isBargain:false}),400,'Direct resignation uses its dedicated action');
  await denied(()=>createStaffBargain(c,staff,{...input,reasonToQuit:'No'}),400,'Actual resignation reason required');
  await denied(()=>createStaffBargain(c,staff,{...input,bargainProposal:{...input.bargainProposal,type:'counteroffer'}}),400,'Unsupported proposal category rejected');
  await denied(()=>createStaffBargain(c,staff,{...input,bargainProposal:{...input.bargainProposal,proposedTerms:3}}),400,'Proposal terms cannot be coerced from numbers');
  await bind(staff);const first=await createStaffBargain(c,staff,input),id=first.bargainId;
  check(first.success,'Active staff may submit actual proposal');
  const saved=(await c.query('select * from public.staff_bargains where id=$1',[id])).rows[0];
  check(saved.staff_assignment_id===own.assignment && saved.manager_context_id===manager.contextId,'Employment and recipient derive from saved relationships');
  check(saved.reason_to_quit===input.reasonToQuit && saved.original_block_id===own.block.id && saved.original_shift==='','Actual original employment snapshot is retained');
  await denied(()=>createStaffBargain(c,staff,input),409,'One unresolved proposal per employment');
  await denied(()=>c.query(`insert into public.staff_bargains(staff_assignment_id,manager_context_id,proposed_terms,reason_to_quit,original_role,original_shift,original_block_id)
    select staff_assignment_id,manager_context_id,proposed_terms,reason_to_quit,original_role,original_shift,original_block_id from public.staff_bargains where id=$1`,[id]),'23505','SQL unique index prevents a second unresolved proposal');
  await denied(()=>c.query(`insert into public.staff_bargains(staff_assignment_id,manager_context_id,proposed_terms,reason_to_quit,original_role,original_shift,original_block_id)
    select staff_assignment_id,manager_context_id,'{}'::jsonb,reason_to_quit,original_role,original_shift,original_block_id from public.staff_bargains where id=$1`,[id]),'23514','Database requires actual typed proposal terms');
  await denied(()=>c.query('update public.staff_bargains set manager_context_id=$2 where id=$1',[id,foreignManager.contextId]),'23514','SQL cannot reassign proposal ownership');
  await denied(()=>c.query('update public.staff_bargains set proposed_terms=$2 where id=$1',[id,JSON.stringify({...input.bargainProposal,notes:'Changed'})]),'23514','SQL cannot rewrite original staff proposal');
  check((await scoped(manager,()=>housingDashboardRows(c,'bargains'))).length===1,'Assigned manager sees proposal');
  const dto=(await scoped(staff,()=>housingDashboardRows(c,'bargains')))[0];
  check(dto.status==='pending' && dto.reasonToQuit===input.reasonToQuit && dto.bargainProposal.type==='custom','Staff form DTO includes actual proposal and lifecycle fields');
  check((await scoped(primary,()=>housingDashboardRows(c,'bargains'))).length===0,'Shared subject primary portal cannot see staff proposals');
  check((await scoped(foreignManager,()=>housingDashboardRows(c,'bargains'))).length===0,'Foreign manager cannot read scoped proposal view');
  check((await scoped(foreignStaff,()=>c.query('select id from public.staff_bargains'))).rowCount===0,'Foreign staff cannot read raw bargain table');
  await c.query('set local role anon');await denied(()=>c.query('select * from public.housing_bargain_details'),'42501','Guest cannot read employment proposals');await c.query('reset role');
  await c.query('set local role pinevela_backend');await denied(()=>c.query("update public.staff_bargains set status='accepted' where id=$1",[id]),'42501','Direct authenticated role cannot decide proposals');await c.query('reset role');
  await denied(()=>respondStaffBargain(c,foreignManager,id,{action:'accept'}),404,'Foreign manager cannot decide proposal');
  await denied(()=>respondStaffBargain(c,staff,id,{action:'accept'}),403,'Staff cannot approve their own proposal');
  await denied(()=>respondStaffBargain(c,manager,id,{action:'reject',responseNote:''}),400,'Declining requires actual manager explanation');
  await denied(()=>respondStaffBargain(c,manager,id,{action:'reject',responseNote:'Current terms retained',updatedShift:'Day Shift'}),400,'Declining cannot modify employment');
  await denied(()=>respondStaffBargain(c,manager,id,{action:'accept',updatedSalary:1200}),400,'No unused payroll subsystem introduced');
  await denied(()=>respondStaffBargain(c,manager,id,{action:'accept',updatedBlock:foreign.block.name}),400,'Accepted terms cannot assign a foreign block');
  await denied(()=>decideStaffBargain(c,staff,id,{decision:'quit'}),409,'Staff cannot use final-choice action before a rejection');
  await c.query('savepoint manager_ended');await c.query('update public.manager_assignments set ended_at=now() where manager_context_id=$1',[manager.contextId]);
  check((await scoped(manager,()=>housingDashboardRows(c,'bargains'))).length===0,'Ended manager grant loses projection access');
  check((await scoped(manager,()=>c.query('select id from public.staff_bargains'))).rowCount===0,'Ended manager grant loses raw RLS access');
  await denied(()=>respondStaffBargain(c,manager,id,{action:'accept'}),404,'Former assigned manager cannot decide');
  await denied(()=>createStaffBargain(c,foreignStaff,{...input,managerId:manager.contextId}),400,'Manager identity cannot be supplied by another staff');
  await c.query('rollback to savepoint manager_ended');
  await bind(manager);const response={action:'accept',responseNote:'Current shift adjustment accepted',updatedShift:'Day Shift (8 AM - 5 PM)',updatedBlock:'All Blocks'};
  check((await respondStaffBargain(c,manager,id,response)).success,'Assigned manager accepts saved proposal');
  const changed=(await c.query('select shift,assigned_block_id from public.staff_assignments where id=$1',[own.assignment])).rows[0];
  check(changed.shift===response.updatedShift && changed.assigned_block_id===null,'Actual accepted schedule and block changes persist');
  const afterResponse=await counts();check((await respondStaffBargain(c,manager,id,response)).idempotent,'Exact retry is idempotent regardless of JSON key order');
  assert.deepEqual(await counts(),afterResponse);checks++;
  await denied(()=>respondStaffBargain(c,manager,id,{action:'reject',responseNote:'Changed decision'}),409,'Accepted decision cannot be reversed');
  await denied(()=>c.query('update public.staff_bargains set response_note=$2 where id=$1',[id,'Rewritten']),'23514','Database preserves decided response evidence');
  await bind(staff);const rejected=await createStaffBargain(c,staff,input);
  await bind(manager);await respondStaffBargain(c,manager,rejected.bargainId,{action:'reject',responseNote:'Current terms remain'});
  await bind(staff);await denied(()=>createStaffBargain(c,staff,input),409,'Rejected proposal remains unresolved until staff choice');
  await denied(()=>decideStaffBargain(c,foreignStaff,rejected.bargainId,{decision:'quit'}),403,'Other staff cannot make final choice');
  await denied(()=>decideStaffBargain(c,staff,rejected.bargainId,{decision:'stay',managerId:manager.contextId}),400,'Final choice cannot supply ownership fields');
  const staying=await decideStaffBargain(c,staff,rejected.bargainId,{decision:'stay'});check(staying.success && !staying.quit,'Staff can stay after rejection');
  check((await c.query('select status from public.staff_assignments where id=$1',[own.assignment])).rows[0].status==='active','Staying preserves current active employment');
  check((await decideStaffBargain(c,staff,rejected.bargainId,{decision:'stay'})).idempotent,'Staying retry does not duplicate notices');
  await denied(()=>decideStaffBargain(c,staff,rejected.bargainId,{decision:'quit'}),409,'Final stay choice cannot be changed into resignation');

  const reviewInput={staffId:own.assignment,rating:4,comment:'Resident staff review workflow verification'};
  await denied(()=>createStaffReview(c,primary,reviewInput),403,'Primary portal cannot review without resident allocation');
  await denied(()=>createStaffReview(c,manager,reviewInput),403,'Manager cannot impersonate resident reviewer');
  await denied(()=>createStaffReview(c,foreignResident,reviewInput),403,'Resident cannot review foreign residence staff');
  await denied(()=>createStaffReview(c,resident,{...reviewInput,staffId:foreign.assignment}),403,'Resident cannot select foreign staff');
  await denied(()=>createStaffReview(c,resident,{...reviewInput,reviewerId:foreignResident.contextId}),400,'Reviewer ownership cannot be supplied');
  await denied(()=>createStaffReview(c,resident,{...reviewInput,allocationId:foreign.allocation}),400,'Allocation identity cannot be supplied');
  await denied(()=>createStaffReview(c,resident,{...reviewInput,issueId:crypto.randomUUID()}),400,'Repair ratings remain separate from staff reviews');
  for(const rating of [0,6,2.5,'5',null])await denied(()=>createStaffReview(c,resident,{...reviewInput,rating}),400,'Invalid explicit review rating rejected');
  await denied(()=>createStaffReview(c,resident,{...reviewInput,comment:'x'.repeat(3001)}),400,'Oversized review comment rejected');
  await bind(resident);const review=await createStaffReview(c,resident,reviewInput);
  check(review.reviewerId===resident.contextId && review.staffId===own.assignment && review.hostelId===own.id && review.rating===4,'Review derives exact active allocation and saved same-residence staff');
  const evidence=(await c.query('select * from public.staff_reviews where id=$1',[review.id])).rows[0];
  check(evidence.allocation_id===own.allocation && !Object.hasOwn(evidence,'issue_id'),'Review records actual allocation without a retired maintenance cross-link');
  check((await scoped(resident,()=>staffReviews(c))).length===1,'Activated resident can read own residence private staff reviews');
  check((await scoped(manager,()=>staffReviews(c))).length===1,'Assigned manager can read staff reviews');
  check((await scoped(staff,()=>staffReviews(c))).length===1,'Exact staff can read own private reviews');
  for(const a of [primary,foreignResident,foreignManager,foreignStaff])check((await scoped(a,()=>staffReviews(c))).length===0,'Other portal or residence cannot read staff reviews');
  check((await scoped(resident,()=>staffReviews(c,foreign.assignment))).length===0,'Query filter cannot bypass residence RLS');
  await denied(()=>c.query('update public.staff_reviews set resident_context_id=$2 where id=$1',[review.id,foreignResident.contextId]),'23514','Review author immutable in database');
  await denied(()=>c.query('update public.staff_reviews set rating=5 where id=$1',[review.id]),'23514','Review score evidence immutable');
  await denied(()=>c.query('insert into public.staff_reviews(allocation_id,staff_assignment_id,resident_context_id,rating) values ($1,$2,$3,4)',[foreign.allocation,own.assignment,foreignResident.contextId]),'23514','SQL rejects cross-residence review');
  await denied(()=>c.query('insert into public.staff_reviews(allocation_id,staff_assignment_id,resident_context_id,rating) values ($1,$2,$3,4)',[own.allocation,own.assignment,foreignResident.contextId]),'23514','SQL rejects spoofed allocation reviewer');
  await c.query('set local role anon');await denied(()=>c.query('select * from public.housing_staff_reviews'),'42501','No public staff ratings view');await c.query('reset role');
  await c.query('set local role pinevela_backend');await denied(()=>c.query('insert into public.staff_reviews(allocation_id,staff_assignment_id,resident_context_id,rating) values ($1,$2,$3,4)',[own.allocation,own.assignment,resident.contextId]),'42501','Direct browser role cannot bypass review API');await c.query('reset role');
  await c.query('savepoint allocation_ended');await c.query('update public.allocations set ended_at=now() where id=$1',[own.allocation]);
  await denied(()=>createStaffReview(c,resident,reviewInput),403,'Former allocation cannot review staff');
  check((await scoped(resident,()=>staffReviews(c))).length===0,'Former allocation loses private review reads');
  check((await c.query('select id from public.staff_reviews where id=$1',[review.id])).rowCount===1,'Allocation release retains historical review evidence');
  await c.query('rollback to savepoint allocation_ended');
  await c.query('savepoint staff_suspended');await editStaff(c,manager,own.assignment,{status:'Suspended'});
  await denied(()=>createStaffReview(c,resident,reviewInput),403,'Suspended staff cannot receive new resident reviews');
  await denied(()=>createStaffBargain(c,staff,input),404,'Suspended staff cannot submit retention proposal');
  await claims(staff);await c.query('set local role pinevela_backend');check((await c.query('select id from public.staff_reviews')).rowCount===0,'Suspended staff loses raw review reads');await c.query('reset role');
  await c.query('rollback to savepoint staff_suspended');
  await bind(staff);const quit=await createStaffBargain(c,staff,input);
  await bind(manager);await respondStaffBargain(c,manager,quit.bargainId,{action:'reject',responseNote:'Unable to change current terms'});
  await c.query('savepoint staff_quit');await bind(staff);const result=await decideStaffBargain(c,staff,quit.bargainId,{decision:'quit'});
  check(result.quit,'Rejected staff proposal can end employment');
  const ended=(await c.query('select status,end_reason,ended_at from public.staff_assignments where id=$1',[own.assignment])).rows[0];
  check(ended.status==='resigned' && ended.ended_at && ended.end_reason===input.reasonToQuit,'Resignation saves original reason and employment history');
  check((await c.query('select status,staff_decided_at from public.staff_bargains where id=$1',[quit.bargainId])).rows[0].status==='quit_confirmed','Final proposal decision persists before employment closes');
  check((await c.query('select session_id from private.account_sessions where active_context_id=$1',[staff.contextId])).rowCount===0,'Final resignation revokes portal sessions');
  await claims(staff);await c.query('set local role pinevela_backend');check((await c.query('select id from public.staff_bargains')).rowCount===0,'Departed staff loses historical proposal access');await c.query('reset role');
  check((await scoped(manager,()=>staffReviews(c))).length===1,'Manager retains historical staff review evidence');
  await denied(()=>createStaffReview(c,resident,reviewInput),403,'Ended staff cannot receive new reviews');
  check((await c.query('select count(*) from auth.users')).rows[0].count===before.users,'Resignation does not delete Auth identity');
  await c.query('rollback to savepoint staff_quit');
  await bind(manager);await editStaff(c,manager,own.assignment,{},'removed');
  check((await c.query('select status from public.staff_bargains where id=$1',[quit.bargainId])).rows[0].status==='cancelled','Manager removal cancels unresolved rejected proposal');
  check((await c.query('select id from public.staff_reviews where id=$1',[review.id])).rowCount===1,'Manager removal retains review foreign keys');
  check((await c.query('select notification_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.category=\'staff_bargain\'',[manager.contextId])).rowCount!>0,'Saved manager receives retention notices');
  check((await c.query('select notification_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.category=\'staff_review\'',[staff.contextId])).rowCount===1,'Exact staff receives review notice');
  check((await c.query('select notification_id from public.notification_recipients where context_id=$1',[primary.contextId])).rowCount===0,'Parent portal does not receive private employment notices');
  await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,rolledBack:true,authUsersCreated:0,providerFlowTested:false,authenticatedHttpTested:false}));
} catch(error) {console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
finally {await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
