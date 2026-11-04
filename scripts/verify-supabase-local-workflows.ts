import {termsAcceptance} from '../legalPolicy.js';
/** Native business acceptance against the explicitly owned local Supabase stack.
 * Business writes go through real HTTP handlers. Identities are confirmed by the
 * real local GoTrue/Mailpit pair; SQL below is read-only verification only. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {SupabaseDatabase,UUID,type VerifiedActor} from '../supabase/db.js';
import {createLocalPrimary,readLocalFixture,saveLocalFixture,signInLocalAccount,runLocalSupabaseVerification,
 type LocalSupabaseHarness,type LocalApiSession,type LocalAccountCredentials} from './lib/local-supabase-harness.js';
import {verifyLocalPricing,verifyLocalMaintenance} from './lib/local-supabase-pricing.js';
import {createChatIdentity,recoveryPhrase,recoverChatIdentity} from '../src/lib/marketEncryption.js';
import {encryptMarketMessage,type UnlockedChatIdentity} from '../marketEncryptionProtocol.js';

type Actor={credentials:LocalAccountCredentials;session:LocalApiSession;user:any;managerKey?:string};
type Administrator=LocalAccountCredentials&{slot:number;approvalKey:string;settingsKey:string};
type Administrators={version:1;runId:string;origin:string;administrators:Administrator[];officer:LocalAccountCredentials};
type Journal={version:1;runId:string;values:Record<string,any>;pending?:string;lastFailure?:unknown};
type Reply=Awaited<ReturnType<LocalApiSession['request']>>;
const journalName='business-workflows-journal.json';

await runLocalSupabaseVerification(async h=>{
 const administratorFixture=readLocalFixture<Administrators>(h,'administrator-fixtures.json');
 assert.equal(administratorFixture?.runId,h.meta.runId,'Prepare the actual administrator/officer fixture first');
 assert.equal(administratorFixture?.administrators.length,5);
 const administrators=administratorFixture!.administrators;
 let checks=0,stage='initialization';
 const timings:{route:string;ms:number;status:number}[]=[];
 const journal=readLocalFixture<Journal>(h,journalName)||{version:1,runId:h.meta.runId,values:{}};
 assert.equal(journal.runId,h.meta.runId);assert.equal(journal.version,1);
 if(journal.pending)throw Error('A previous native mutation needs reconciliation in the private business journal: '+journal.pending);
 const persist=()=>saveLocalFixture(h,journalName,journal);
 const check=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;};
 const eq=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
 const expect=(reply:Reply,status:number,label:string)=>{
  if(reply.status!==status){journal.lastFailure={stage,label,status:reply.status,expected:status,data:reply.data};persist();}
  assert.equal(reply.status,status,label);checks++;return reply.data;
 };
 async function call(actor:Actor|LocalApiSession,route:string,body?:unknown,method=body===undefined?'GET':'POST',withKey=true){
  const session='session' in actor?actor.session:actor;
  const headers:Record<string,string>={};
  if(body!==undefined)headers['content-type']='application/json';
  if('session' in actor&&actor.managerKey&&withKey)headers['x-pinevela-manager-key']=actor.managerKey;
  const started=performance.now();
  const reply=await session.request(route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  timings.push({route:route.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/gi,':id').split('?')[0],ms:performance.now()-started,status:reply.status});
  return reply;
 }
 async function write(key:string,actor:Actor|LocalApiSession,route:string,body:unknown,status=200,method='POST'){
  if(Object.hasOwn(journal.values,key))return journal.values[key];
  journal.pending=key;persist();
  const reply=await call(actor,route,body,method);
  if(reply.status>=400&&reply.status<500){delete journal.pending;persist();}
  const data=expect(reply,status,key);
  journal.values[key]=data;delete journal.pending;persist();return data;
 }
 function credentials(label:string,kind:string):LocalAccountCredentials{
  const key='credentials-'+label;
  if(!journal.values[key]){
   const domain=kind==='resident'||kind==='seller'?'st.knust.edu.gh':'pinevela.test';
   journal.values[key]={email:label+'-'+h.meta.runId.replaceAll('-','')+'@'+domain,
    password:crypto.randomBytes(30).toString('base64url')+'aA1!',name:'Local '+label,accountKind:kind};persist();
  }
  return journal.values[key];
 }
 async function login(c:LocalAccountCredentials):Promise<Actor>{const signed=await signInLocalAccount(h,c);c.contextId=signed.user.id;c.role=signed.user.role;persist();return{credentials:c,...signed};}
 async function enrollment(owner:Actor,label:string,kind:string){
  const c=credentials(label,kind),startedKey=label+'-started';
  if(!journal.values[startedKey]){journal.values[startedKey]=Date.now();persist();}
  const enrolled=await write(label+'-enroll',owner,'/api/auth/enrollments',{kind,email:c.email,name:c.name,phone:'+233241234567',password:c.password},202);
  check(UUID.test(enrolled.enrollmentId),'Native enrollment supplies a real ID');
  const verifiedKey=label+'-verified';
  if(!journal.values[verifiedKey]){
   const record=(await h.db.pool.query('select email_confirmed_at from auth.users where id=$1',[enrolled.signupId])).rows[0];
   const body=record?.email_confirmed_at?{password:c.password}:{code:h.providerOrigin+await h.mail.confirmation(c.email,journal.values[startedKey])};
   await write(verifiedKey,owner,'/api/auth/enrollments/'+enrolled.enrollmentId+'/verify',body);
  }
  const list=expect(await call(owner,'/api/auth/enrollments'),200,'Owner reads own enrollments');
  const actual=list.find((r:any)=>r.id===enrolled.enrollmentId);
  check(actual?.verified_at,'Actual local email confirmation is saved');c.contextId=actual.account_id;persist();
  return{credentials:c,enrollmentId:enrolled.enrollmentId};
 }
 async function photo(actor:Actor,label:string,purpose:'hostel'|'market'){
  if(journal.values[label])return journal.values[label].imagePath;
  const bytes=await sharp({create:{width:320,height:240,channels:3,background:purpose==='hostel'?'#296d51':'#b86e31'}}).png().toBuffer();
  const result=await write(label,actor,'/api/storage/upload-'+purpose+'-image',{
   fileData:'data:image/png;base64,'+bytes.toString('base64'),fileType:'image/png',fileName:label+'.png'},201);
  check(UUID.test(result.assetId),'Real local Storage asset is created');return result.imagePath;
 }
 async function manager(owner:Actor,suffix:string,admin:Actor,officer:Actor){
  const label='manager-'+suffix,enrolled=await enrollment(owner,label,'manager');
  const property={name:'Local Acceptance Hostel '+suffix.toUpperCase(),latitude:suffix==='a'?6.67:6.68,longitude:suffix==='a'?-1.57:-1.58};
  const submitted=await write(label+'-case',owner,'/api/auth/register-manager',{
   enrollmentId:enrolled.enrollmentId,hostelName:property.name,location:'Local disposable property '+suffix+', Kumasi',
   latitude:property.latitude,longitude:property.longitude,landmark:'Local acceptance only',description:'Owned local dummy property; no actual physical inspection is claimed.',knustAccreditedConfirmed:true},201);
  const caseId=submitted.verification.id,residenceId=submitted.verification.residenceId;
  check(UUID.test(caseId)&&UUID.test(residenceId),'Manager application creates real native case/property');
  const dispatch=await write(label+'-dispatch',admin,'/api/admin/dispatch-verification-team',{
   managerVerificationId:caseId,assignedOfficerId:officer.user.id,priority:'medium',adminDispatchNotes:'Owned local dummy workflow dispatch.'},201);
  const inspectionId=dispatch.inspection.id;
  const inspections=expect(await call(officer,'/api/verification-team/my-inspections'),200,'Actual officer receives dispatch');
  check(inspections.some((r:any)=>r.id===inspectionId&&r.managerVerificationId===caseId),'Saved dispatch appears in assigned officer portal');
  await write(label+'-report',officer,'/api/verification-team/inspections/'+inspectionId+'/submit-report',{
   observations:'Automated local acceptance report for a dummy property. No real property visit has taken place.',
   recommendation:'requires_reinspection',checklist:{residenceExists:false,managerConnected:false,basicPropertyInfoVerified:false,
    managerAuthorityConfirmed:false,generalLegitimacyConfirmed:false,safetyHabitableCompliance:false},
   propertyDetails:{estimatedRooms:2,estimatedBeds:4,buildingStructure:'Local dummy structure',securityPresent:false,utilitiesOperational:false},gpsCoordinates:null,photos:[]});
  await write(label+'-approved',admin,'/api/manager-verifications/'+caseId+'/approve',{
   adminNotes:'Owned disposable local acceptance override only; this is not evidence of a real physical inspection.',privateKey:admin.credentials.approvalKey},200,'PUT');
  const actor=await login(enrolled.credentials);
  const key=await write(label+'-key',actor,'/api/manager/secret-key/issue',{});
  check(typeof key.key==='string'&&key.key.length>20,'Native manager key issued and stored privately');actor.managerKey=key.key;
  const imageUrl=await photo(actor,label+'-cover','hostel'),gallery=await photo(actor,label+'-gallery','hostel');
  const blocksList=[{name:'Local Block '+suffix.toUpperCase(),gender:'Mixed',floors:1,roomPrefix:suffix.toUpperCase(),startNum:1,
   roomTypes:[{typeName:'Local twin',bedsPerRoom:2,totalRooms:2}]}];
  const registration=await write(label+'-registration',actor,'/api/hostels/register',{
   residenceId,name:property.name,addressLine1:'1 Local Test Road, Kumasi',latitude:property.latitude,longitude:property.longitude,
   managerName:'Local Test Manager',contactEmail:enrolled.credentials.email,contactPhone:'+233241234567',contactPhoneCountry:'GH',
   genderCategory:'Mixed',wing:'Hostel',hostelType:'Hostel',yearEstablished:2020,paymentFrequency:'Per Academic Year',
   agreeTerms:true,accuracyCertified:true,description:'Disposable local acceptance residence.',city:'Kumasi',region:'Ashanti',country:'Ghana',
   imageUrl,gallery:[gallery],blocksList},201);
  await write(label+'-setup-approved',admin,'/api/hostel-verifications/'+registration.verificationId+'/approve',{
   adminNotes:'Owned local dummy setup accepted for automated business verification.',privateKey:admin.credentials.approvalKey},200,'PUT');
  const structure=expect(await call(actor,'/api/hostels/'+residenceId+'/structure'),200,'Assigned manager reads native hierarchy');
  eq(structure.totalRooms,2,'Two saved rooms per residence');eq(structure.totalBeds,4,'Four saved beds per residence');
  await write(label+'-roomkeys',actor,'/api/hostels/'+residenceId+'/generate-room-keys',{});
  const keys=expect(await call(actor,'/api/room-keys?hostelId='+residenceId),200,'Assigned manager receives own room keys');
  check(keys.length===2&&keys.every((r:any)=>r.hostelId===residenceId),'Native keys scoped to own two rooms');
  return{actor,residenceId,caseId,inspectionId,registrationId:registration.verificationId,blocksList,keys};
 }
 async function resident(owner:Actor,suffix:string,roomKey:string){
  const label='resident-'+suffix,e=await enrollment(owner,label,'resident');
  await write(label+'-claimed',owner,'/api/room-keys/claim',{enrollmentId:e.enrollmentId,roomKey});
  const actor=await login(e.credentials);eq(actor.user.role,'student','Claimed resident signs in through own portal');return{actor,enrollmentId:e.enrollmentId};
 }
 async function staff(manager:Actor,residenceId:string,suffix:string,block:string){
  const label='staff-'+suffix,c=credentials(label,'staff');
  const invitation=await write(label+'-invitation',manager,'/api/staff',{hostelId:residenceId,name:c.name,email:c.email,
   phone:'+233241234567',role:'Maintenance',shift:'Day',assignedBlock:block},201);
  const token=invitation.invitationToken;
  expect(await call(h.session(),'/api/auth/staff-invitations/inspect',{invitationToken:token}),
   journal.values[label+'-verified']?404:200,journal.values[label+'-verified']?'Consumed staff invitation cannot replay':'Real invitation is inspectable');
  const startedKey=label+'-started';if(!journal.values[startedKey]){journal.values[startedKey]=Date.now();persist();}
  await write(label+'-signup',h.session(),'/api/auth/staff-invitations/signup',{invitationToken:token,password:c.password},202);
  if(!journal.values[label+'-verified']){
   const confirmed=(await h.db.pool.query('select email_confirmed_at from auth.users where lower(email)=$1',[c.email])).rows[0]?.email_confirmed_at;
   const proof=confirmed?{password:c.password}:{code:h.providerOrigin+await h.mail.confirmation(c.email,journal.values[startedKey])};
   await write(label+'-verified',h.session(),'/api/auth/staff-invitations/verify',{invitationToken:token,...proof});
  }
  const actor=await login(c),assignmentId=journal.values[label+'-verified'].staffId;
  check(UUID.test(assignmentId),'Actual staff employment created after captured-mail confirmation');return{actor,assignmentId};
 }
 async function seller(owner:Actor,suffix:string,admin:Actor){
  const label='seller-'+suffix,e=await enrollment(owner,label,'seller');
  const application=await write(label+'-application',owner,'/api/digital-market/register',{
   enrollmentId:e.enrollmentId,university:'Owned Local Acceptance University',categoryToSell:'Books',idNumber:'LOCAL-'+suffix.toUpperCase()+'-1234',
   storeName:'Local Acceptance Store '+suffix.toUpperCase(),certified:true,termsAcceptance:termsAcceptance(true)});
  expect(await call(admin,'/api/admin/digital-market/approve-application',{id:application.application.id,adminNotes:'Owned local dummy student seller.'}),403,'Missing own approval key cannot approve seller');
  await write(label+'-approved',admin,'/api/admin/digital-market/approve-application',{id:application.application.id,adminNotes:'Owned local dummy student seller.',privateKey:admin.credentials.approvalKey});
  const actor=await login(e.credentials);
  const setup=await write(label+'-setup',actor,'/api/digital-market/store-setup',{
   storeName:'Local Acceptance Store '+suffix.toUpperCase(),username:'local-'+suffix+'-'+h.meta.runId.replaceAll('-',''),location:'Local test campus',
   category:'Books',deliveryMode:'Campus Meetup',phone:'+233241234567',phoneCountry:'GH',description:'Disposable local acceptance store.'});
  const requestKey=label+'-activation-request';if(!journal.values[requestKey]){journal.values[requestKey]=crypto.randomUUID();persist();}
  const payment=await write(label+'-activation',actor,'/api/payments/paystack/initialize',{
   requestId:journal.values[requestKey],purpose:'activation',plan:'default'});
  check(payment.success!==false,'Native zero-fee activation completed without a payment-provider call');
  const status=expect(await call(actor,'/api/digital-market/status'),200,'Seller reads activated store');
  eq(status.store.status,'active','Actual store is active');eq(status.store.registrationFeePaid,true,'Native free receipt grants registration');
  const imageUrl=await photo(actor,label+'-product-image','market');
  const product=await write(label+'-product',actor,'/api/digital-market/products',{
   title:'Local Acceptance Book '+suffix.toUpperCase(),description:'Dummy local book used for actual API acceptance.',category:'Books',
   price:10,stockQuantity:3,condition:'Brand New',imageUrl,additionalImages:[],isAvailable:true,isService:false,meetingLocation:'Local test campus'},201);
  return{actor,storeId:setup.store.id,product:product.product};
 }
 try{
  stage='real account preparation';console.log(JSON.stringify({stage,localOnly:true}));
  const adminActors:Actor[]=[];
  for(const c of administrators.slice(0,journal.values.pricing?1:3))adminActors.push(await login(c));
  const officer=await login(administratorFixture!.officer);
  const first=await createLocalPrimary(h,'workflow-owner-a'),second=await createLocalPrimary(h,'workflow-owner-b');
  const ownerA:Actor=first,ownerB:Actor=second,admin=adminActors[0];
  stage='two native housing workflows';console.log(JSON.stringify({stage}));
  const a=await manager(ownerA,'a',admin,officer),b=await manager(ownerB,'b',admin,officer);
  const physicalNotes='Owned disposable local acceptance override only; this is not evidence of a real physical inspection.';
  const setupNotes='Owned local dummy setup accepted for automated business verification.';
  expect(await call(admin,'/api/manager-verifications/'+a.caseId+'/approve',{adminNotes:physicalNotes},'PUT'),403,'Missing own approval key cannot approve manager');
  expect(await call(admin,'/api/manager-verifications/'+a.caseId+'/approve',{adminNotes:physicalNotes,privateKey:'invalid-local-approval-key'},'PUT'),403,'Incorrect own approval key cannot approve manager');
  expect(await call(admin,'/api/manager-verifications/'+a.caseId+'/approve',{adminNotes:physicalNotes,privateKey:admin.credentials.settingsKey},'PUT'),403,'Settings key cannot authorize manager approval');
  expect(await call(admin,'/api/manager-verifications/'+a.caseId+'/approve',{adminNotes:physicalNotes,privateKey:administrators[1].approvalKey},'PUT'),403,'Another administrator key cannot approve for this session');
  expect(await call(admin,'/api/manager-verifications/'+a.caseId+'/approve',{adminNotes:physicalNotes,privateKey:admin.credentials.approvalKey},'PUT'),200,'Actual own approval key authorizes manager review retry');
  expect(await call(admin,'/api/hostel-verifications/'+a.registrationId+'/approve',{adminNotes:setupNotes},'PUT'),403,'Missing own approval key cannot approve residence');
  expect(await call(admin,'/api/hostel-verifications/'+a.registrationId+'/approve',{adminNotes:setupNotes,privateKey:admin.credentials.approvalKey},'PUT'),200,'Actual own approval key authorizes residence review retry');
  const guest=h.session();
  expect(await call(guest,'/api/hostels/'+a.residenceId+'/structure'),401,'Guest cannot inspect private hierarchy');
  expect(await call(ownerA,'/api/hostels/'+a.residenceId+'/structure'),403,'Primary cannot impersonate manager');
  expect(await call(a.actor,'/api/hostels/'+b.residenceId+'/structure'),404,'Manager cannot read foreign hierarchy');
  expect(await call(a.actor,'/api/hostels/'+b.residenceId+'/generate-room-keys',{}),404,'Manager cannot generate foreign room keys');
  expect(await call(a.actor,'/api/hostels/'+a.residenceId+'/generate-room-keys',{},'POST',false),403,'Manager writes require actual operation key');
  const residentA=await resident(ownerA,'a',a.keys[0].roomKey);
  // The second owner's verified pending enrollment provides an independent
  // contender for the already claimed key before activation in its own hostel.
  const residentBEnrollment=await enrollment(ownerB,'resident-b','resident');
  expect(await call(ownerB,'/api/room-keys/claim',{enrollmentId:residentBEnrollment.enrollmentId,roomKey:a.keys[0].roomKey}),409,'Used room key rejects a second owner');
  const residentB=await resident(ownerB,'b',b.keys[0].roomKey);
  expect(await call(ownerA,'/api/room-keys/claim',{enrollmentId:residentA.enrollmentId,roomKey:a.keys[1].roomKey}),409,'A resident cannot allocate a second room');
  expect(await call(ownerA,'/api/room-keys/claim',{enrollmentId:residentB.enrollmentId,roomKey:a.keys[1].roomKey}),404,'Another owner cannot use an enrollment');
  const staffA=await staff(a.actor,a.residenceId,'a',a.blocksList[0].name),staffB=await staff(b.actor,b.residenceId,'b',b.blocksList[0].name);
  const staffPayload={hostelId:b.residenceId,name:'Denied local invitation',email:'denied-'+h.meta.runId.replaceAll('-','')+'@pinevela.test',phone:'+233241234567',role:'Maintenance',shift:'Day'};
  expect(await call(ownerA,'/api/staff',staffPayload),403,'Primary cannot create staff');
  expect(await call(a.actor,'/api/staff',staffPayload),404,'Manager cannot invite into a foreign hostel');
  expect(await call(a.actor,'/api/staff',{...staffPayload,hostelId:a.residenceId,managerId:b.actor.user.id}),400,'Client-supplied staff creator denied');
  expect(await call(a.actor,'/api/staff',{...staffPayload,hostelId:a.residenceId,assignedBlock:b.blocksList[0].name}),400,'Foreign block denied');
  expect(await call(a.actor,'/api/staff/'+staffB.assignmentId,{shift:'Night'},'PUT'),404,'Manager cannot change foreign employment');
  await write('staff-a-updated',a.actor,'/api/staff/'+staffA.assignmentId,{shift:'Evening'},200,'PUT');
  const review={staffId:staffA.assignmentId,rating:5,comment:'Owned local activated resident review.'};
  expect(await call(guest,'/api/staff-reviews',review),401,'Public staff reviews denied');
  expect(await call(ownerA,'/api/staff-reviews',review),403,'Primary cannot submit resident staff review');
  expect(await call(residentB.actor,'/api/staff-reviews',review),403,'Cross-hostel staff review denied');
  await write('resident-a-staff-review',residentA.actor,'/api/staff-reviews',review,201);
  stage='maintenance and staff retention';console.log(JSON.stringify({stage}));
  expect(await call(residentA.actor,'/api/issue-reports',{title:'Denied foreign complaint',description:'Local negative case',hostelId:b.residenceId,roomId:b.keys[0].roomId}),403,'Resident cannot report a foreign room');
  const issue=await write('resident-a-maintenance',residentA.actor,'/api/issue-reports',{
   title:'Local acceptance repair',description:'Dummy local maintenance workflow.',category:'Plumbing',urgency:'Normal',photos:[]},201);
  const issueId=issue.id;
  expect(await call(b.actor,'/api/issue-reports/'+issueId+'/assign',{staffId:staffB.assignmentId,timeframe:'24h'}),404,'Foreign manager cannot assign repair');
  if(!journal.values['maintenance-closed'])expect(await call(a.actor,'/api/issue-reports/'+issueId+'/assign',{staffId:staffB.assignmentId,timeframe:'24h'}),403,'Foreign staff cannot receive this repair');
  await write('maintenance-assigned',a.actor,'/api/issue-reports/'+issueId+'/assign',{staffId:staffA.assignmentId,timeframe:'24h'});
  expect(await call(staffB.actor,'/api/issue-reports/'+issueId+'/accept-assignment',{}),404,'Foreign staff cannot accept another hostel repair');
  await write('maintenance-accepted',staffA.actor,'/api/issue-reports/'+issueId+'/accept-assignment',{});
  await write('maintenance-reschedule',staffA.actor,'/api/issue-reports/'+issueId+'/staff-reschedule',{reason:'Owned local schedule verification.',requestedTimeframe:'48h'});
  await write('maintenance-reschedule-approved',a.actor,'/api/issue-reports/'+issueId+'/approve-reschedule',{managerNotes:'Owned local schedule accepted.'});
  await write('maintenance-completed',staffA.actor,'/api/issue-reports/'+issueId+'/staff-complete',{completionNotes:'Owned local dummy repair completed.',completionPhotos:[]});
  expect(await call(residentB.actor,'/api/issue-reports/'+issueId+'/student-confirm',{isResolved:true,rating:5}),404,'Foreign resident cannot confirm repair');
  await write('maintenance-confirmed',residentA.actor,'/api/issue-reports/'+issueId+'/student-confirm',{isResolved:true,feedback:'Owned local repair confirmation.',rating:5});
  await write('maintenance-closed',a.actor,'/api/issue-reports/'+issueId+'/manager-close',{managerNotes:'Owned local workflow complete.'});
  const bargain=await write('staff-a-retention',staffA.actor,'/api/staff-bargains',{reasonToQuit:'Local schedule negotiation test.',isBargain:true,
   bargainProposal:{type:'shift',title:'Local schedule proposal',proposedTerms:'Switch to a later local shift.',notes:'Owned disposable case.'}},201);
  expect(await call(b.actor,'/api/staff-bargains/'+bargain.bargainId+'/manager-response',{action:'reject',responseNote:'Denied local cross-hostel case.'}),404,'Foreign manager cannot decide retention');
  await write('staff-a-retention-declined',a.actor,'/api/staff-bargains/'+bargain.bargainId+'/manager-response',{action:'reject',responseNote:'Local acceptance declined terms.'});
  await write('staff-a-retention-stay',staffA.actor,'/api/staff-bargains/'+bargain.bargainId+'/staff-decision',{decision:'stay'});
  stage='native pricing quorum';console.log(JSON.stringify({stage}));
  const pricingAdmins=adminActors.map((actor,i)=>({session:actor.session,contextId:actor.user.id,settingsKey:administrators[i].settingsKey,approvalKey:administrators[i].approvalKey}));
  if(!journal.values.pricing){journal.values.pricing=await verifyLocalPricing(h,pricingAdmins,ownerA.session);persist();}
  stage='two native market workflows';console.log(JSON.stringify({stage}));
  const sellerA=await seller(ownerA,'a',admin),sellerB=await seller(ownerB,'b',admin);
  const chatIdentities=new Map<string,UnlockedChatIdentity>();
  for(const actor of [ownerA,ownerB,sellerA.actor,sellerB.actor]){
   const secretKey='chat-recovery-'+actor.user.id;
   const record=expect(await call(actor,'/api/digital-market/encryption'),200,'Actual account reads own encrypted chat backup');
   if(record.publicIdentity){assert.equal(typeof journal.values[secretKey],'string','Saved private recovery phrase required for existing local identity');chatIdentities.set(actor.user.id,await recoverChatIdentity(actor.user.id,journal.values[secretKey],record.publicIdentity,record.backup));}
   else{if(!journal.values[secretKey]){journal.values[secretKey]=recoveryPhrase();persist();}const created=await createChatIdentity(actor.user.id,journal.values[secretKey]);await write('chat-enabled-'+actor.user.id,actor,'/api/digital-market/encryption',{publicIdentity:created.publicIdentity,backup:created.backup,proof:created.proof},201);chatIdentities.set(actor.user.id,created.identity);}
  }
  expect(await call(sellerA.actor,'/api/digital-market/products/'+sellerB.product.id,{title:'Denied foreign edit'},'PUT'),404,'Seller cannot alter foreign inventory');
  expect(await call(sellerA.actor,'/api/digital-market/products',{...sellerA.product,storeId:sellerB.storeId}),400,'Client cannot select listing ownership');
  const catalog=expect(await call(guest,'/api/digital-market/products'),200,'Guest reads actual public local catalog');
  check(catalog.some((p:any)=>p.id===sellerA.product.id)&&catalog.some((p:any)=>p.id===sellerB.product.id),'Both paid/approved native stores publish actual listings');
  const inventory=expect(await call(sellerA.actor,'/api/digital-market/inventory'),200,'Seller reads actual owned inventory');
  check(Array.isArray(inventory)&&inventory.every((p:any)=>p.storeId===sellerA.storeId),'Inventory excludes foreign store');
  const nonce=(key:string)=>{if(!journal.values[key]){journal.values[key]=crypto.randomUUID();persist();}return journal.values[key];};
  async function encryptedBody(key:string,sender:Actor,recipient:Actor,requestId:string,content:string,selectors:Record<string,unknown>){if(!journal.values[key]){const encrypted=await encryptMarketMessage(chatIdentities.get(sender.user.id)!,chatIdentities.get(recipient.user.id)!.publicIdentity,{requestId,buyerId:ownerA.user.id,storeId:sellerB.storeId,senderId:sender.user.id,recipientId:recipient.user.id},content);journal.values[key]={requestId,...selectors,encrypted};persist();}return journal.values[key];}
  const messageBody=await encryptedBody('message-a-encrypted',ownerA,sellerB.actor,nonce('message-a-request'),'Local buyer inquiry for actual acceptance.',{sellerStoreId:sellerB.storeId,productId:sellerB.product.id});
  expect(await call(ownerA,'/api/digital-market/messages',{requestId:crypto.randomUUID(),sellerStoreId:sellerB.storeId,content:'Forbidden plaintext legacy send'}),400,'New plaintext messages are rejected');
  expect(await call(ownerA,'/api/digital-market/messages',{...messageBody,buyerId:ownerB.user.id}),400,'Buyer identity spoofing denied');
  const inquiry=await write('buyer-a-inquiry',ownerA,'/api/digital-market/messages',messageBody,201);
  const replay=expect(await call(ownerA,'/api/digital-market/messages',messageBody),201,'Message request can retry');
  eq(replay.message.id,inquiry.message.id,'Message retry does not duplicate');eq(replay.idempotent,true,'Message retry is marked idempotent');
  await write('seller-b-reply',sellerB.actor,'/api/digital-market/messages',await encryptedBody('reply-b-encrypted',sellerB.actor,ownerA,nonce('reply-b-request'),'Local seller reply to actual buyer.',{sellerStoreId:sellerB.storeId,buyerId:ownerA.user.id,productId:sellerB.product.id}),201);
  expect(await call(sellerA.actor,'/api/digital-market/messages',{...await encryptedBody('foreign-reply-encrypted',sellerA.actor,ownerA,crypto.randomUUID(),'Denied foreign reply.',{}),sellerStoreId:sellerB.storeId,buyerId:ownerA.user.id}),404,'Foreign seller cannot join conversation');
  expect(await call(ownerB,'/api/digital-market/messages?buyerId='+ownerA.user.id),400,'Caller cannot select another message identity');
  const bMessages=expect(await call(ownerB,'/api/digital-market/messages'),200,'Other buyer reads own messages');
  check(!bMessages.some((m:any)=>m.id===inquiry.message.id),'Buyer conversation remains private');
  const orderBody={requestId:nonce('order-a-request'),productId:sellerB.product.id,quantity:1,buyerPhone:'+233241234567',meetingLocation:'Local test campus'};
  expect(await call(ownerA,'/api/digital-market/orders',{...orderBody,buyerId:ownerB.user.id}),400,'Order buyer spoofing denied');
  const order=await write('buyer-a-order',ownerA,'/api/digital-market/orders',orderBody,201),orderId=order.order.id;
  check(/^\d{6}$/.test(order.order.otpPin),'Delivery PIN comes from the actual native order only');
  const orderReplay=expect(await call(ownerA,'/api/digital-market/orders',orderBody),201,'Order request retries safely');eq(orderReplay.order.id,orderId,'Order retry does not duplicate');
  expect(await call(ownerB,'/api/digital-market/orders/'+orderId+'/update-status',{action:'cancelled'}),404,'Another buyer cannot cancel this order');
  const sellerOrders=expect(await call(sellerB.actor,'/api/digital-market/my-orders'),200,'Seller receives actual buy request');
  check(sellerOrders.some((o:any)=>o.id===orderId)&&sellerOrders.every((o:any)=>!Object.hasOwn(o,'otpPin')),'Seller response excludes buyer delivery PIN');
  await write('order-a-agreed',sellerB.actor,'/api/digital-market/orders/'+orderId+'/update-status',{action:'agree-location'});
  if(!journal.values['order-a-completed']){
   const wrongPin=order.order.otpPin==='000000'?'000001':'000000';
   expect(await call(sellerB.actor,'/api/digital-market/orders/'+orderId+'/update-status',{action:'completed',inputPin:wrongPin}),400,'Wrong delivery PIN cannot complete handover');
  }
  await write('order-a-completed',sellerB.actor,'/api/digital-market/orders/'+orderId+'/update-status',{action:'completed',inputPin:order.order.otpPin});
  expect(await call(sellerB.actor,'/api/digital-market/orders/'+orderId+'/update-status',{action:'completed',inputPin:order.order.otpPin}),200,'Completed handover retry succeeds without another stock deduction');
  expect(await call(ownerB,'/api/digital-market/ratings',{orderId,rating:5,review:'Denied foreign review'}),404,'Only actual buyer can review purchase');
  await write('buyer-a-purchase-review',ownerA,'/api/digital-market/ratings',{orderId,rating:5,review:'Owned local verified handover review.'});
  const publicReviews=expect(await call(guest,'/api/digital-market/ratings?storeId='+sellerB.storeId),200,'Public verified purchase reviews available');
  check(publicReviews.ratings.some((r:any)=>r.review==='Owned local verified handover review.'),'Completed native handover supplies public review');
  const afterStock=expect(await call(sellerB.actor,'/api/digital-market/inventory'),200,'Inventory reloads after handover');
  eq(afterStock.find((p:any)=>p.id===sellerB.product.id)?.stockQuantity,2,'Actual stock deducted exactly once');
  stage='database RLS and independent connection persistence';console.log(JSON.stringify({stage}));
  async function actorFromBinding(actor:Actor):Promise<VerifiedActor>{
   const rows=(await h.db.pool.query(`select s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
    from private.account_sessions s join public.account_contexts c on c.id=s.active_context_id join auth.sessions live on live.id=s.session_id
    where c.id=$1 and (live.not_after is null or live.not_after>now()) order by s.updated_at desc limit 1`,[actor.user.id])).rows;
   check(rows.length===1,'A genuine live GoTrue session supplies the RLS actor');return rows[0];
  }
  const managerActor=await actorFromBinding(a.actor),residentActor=await actorFromBinding(residentA.actor),sellerActor=await actorFromBinding(sellerA.actor),buyerActor=await actorFromBinding(ownerA);
  const ownRooms=await h.db.readActor(managerActor,c=>c.query('select r.id from public.rooms r join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id where b.residence_id=$1',[a.residenceId]));
  eq(ownRooms.rowCount,2,'RLS permits own manager hierarchy');
  eq((await h.db.readActor(managerActor,c=>c.query('select id from public.blocks where residence_id=$1',[b.residenceId]))).rowCount,0,'RLS hides foreign hostel blocks');
  eq((await h.db.readActor(residentActor,c=>c.query('select id from public.allocations where resident_context_id=$1',[residentB.actor.user.id]))).rowCount,0,'RLS hides foreign resident allocation');
  eq((await h.db.readActor(sellerActor,c=>c.query('select id from public.market_messages where store_id=$1',[sellerB.storeId]))).rowCount,0,'RLS hides foreign seller conversations');
  eq((await h.db.readActor(buyerActor,c=>c.query('select id from public.market_orders where buyer_context_id=$1',[ownerB.user.id]))).rowCount,0,'RLS hides foreign buyer orders');
  const dbUrl=new URL(h.meta.databaseUrl),independent=new SupabaseDatabase({host:'127.0.0.1',port:Number(dbUrl.port),database:decodeURIComponent(dbUrl.pathname.slice(1)),user:decodeURIComponent(dbUrl.username),password:decodeURIComponent(dbUrl.password),ssl:false,max:1});
  try{
   const saved=(await independent.pool.query(`select
    (select count(*)::int from public.allocations where resident_context_id=any($1::uuid[]) and ended_at is null) as allocations,
    (select count(*)::int from (select bed_id from public.allocations where ended_at is null group by bed_id having count(*)>1) d) as duplicate_beds,
    (select count(*)::int from (select resident_context_id from public.allocations where ended_at is null group by resident_context_id having count(*)>1) d) as duplicate_residents,
    (select status from public.market_orders where id=$2) as order_status,
    (select stock_quantity from public.listings where id=$3) as stock,
    (select count(*)::int from public.maintenance_events where issue_id=$4) as maintenance_events,
    (select count(*)::int from public.staff_reviews where id=$5) as staff_reviews`,[
    [residentA.actor.user.id,residentB.actor.user.id],orderId,sellerB.product.id,issueId,journal.values['resident-a-staff-review'].id])).rows[0];
   eq(saved.allocations,2,'Both allocations persist on an independent database connection');eq(saved.duplicate_beds,0,'No active bed has two occupants');eq(saved.duplicate_residents,0,'No resident has two active allocations');
   eq(saved.order_status,'completed','Completed handover persists');eq(saved.stock,2,'Stock persists without duplicate deduction');check(saved.maintenance_events>=8,'Real maintenance history persists');eq(saved.staff_reviews,1,'Authorized staff review persists');
  }finally{await independent.close();}
  stage='maintenance recovery';console.log(JSON.stringify({stage}));
  if(!journal.values.maintenance){journal.values.maintenance=await verifyLocalMaintenance(h,pricingAdmins[0],ownerA.session);persist();}
  // Prepare a real assigned pending repair for the staff browser portal after
  // the completed repair above. These are distinct native persisted records.
  const browserIssue=await write('browser-maintenance',residentA.actor,'/api/issue-reports',{
   title:'Local browser pending repair',description:'Owned local pending repair for portal acceptance.',category:'Electrical',urgency:'Normal',photos:[]},201);
  await write('browser-maintenance-assigned',a.actor,'/api/issue-reports/'+browserIssue.id+'/assign',{staffId:staffA.assignmentId,timeframe:'24h'});
  const role=(actor:Actor,readyText:string)=>({email:actor.credentials.email,password:actor.credentials.password,name:actor.credentials.name,
   accountKind:actor.credentials.accountKind,...(actor.credentials.portalPin?{portalPin:actor.credentials.portalPin}:{}),role:actor.user.role,contextId:actor.user.id,readyText});
  const fixture={version:1,runId:h.meta.runId,metadataPath:process.argv.at(-1),origin:administratorFixture!.origin,databaseOwned:true,
   roles:{primary:role(ownerA,ownerA.credentials.name),resident:role(residentA.actor,residentA.actor.credentials.name),
    seller:role(sellerA.actor,'Local Acceptance Store A'),manager:role(a.actor,a.actor.credentials.name),
    staffA:role(staffA.actor,staffA.actor.credentials.name),staffB:role(staffB.actor,staffB.actor.credentials.name),
    administrator:role(admin,admin.credentials.name),officer:role(officer,officer.credentials.name)},publicStoreId:sellerA.storeId};
  saveLocalFixture(h,'business-browser-fixtures.json',fixture);
  // Auth POST pacing is a deliberate fixture admission delay, not server work.
  const sorted=timings.filter(t=>!t.route.startsWith('/api/auth/')).map(t=>t.ms).sort((a,b)=>a-b),percentile=(p:number)=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]||0);
  const result={version:1,runId:h.meta.runId,checks,pricing:journal.values.pricing,maintenance:journal.values.maintenance,
   actualGoTrue:true,actualLocalMail:true,actualLocalStorage:true,httpRequests:timings.length,latencyMs:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},
   realIdentityCopies:0,hostedWrites:0,paymentProviderCalls:0,coverage:['two-owners','two-hostels','native-inspection','hierarchy','allocation-uniqueness','staff-invitations','resident-staff-review','maintenance-lifecycle','staff-retention','pricing-quorum','two-sellers','inventory','buyer-seller-messages','order-idempotency','delivery-pin','verified-purchase-review','RLS','independent-database-connection','maintenance-recovery'],
   limits:['Google OAuth and payment gateways are deliberately outside this local acceptance.','Independent connection persistence is verified; complete process restart is a separate acceptance check.']};
  saveLocalFixture(h,'business-workflows-result.json',result);saveLocalFixture(h,'business-workflows-http-timings.json',timings);
  console.log(JSON.stringify({stage:'passed',checks,pricingChecks:result.pricing.checks,maintenanceChecks:result.maintenance.checks,httpRequests:timings.length,latencyMs:result.latencyMs,browserFixture:'business-browser-fixtures.json',hostedWrites:0,paymentProviderCalls:0}));
 }catch(error){
  saveLocalFixture(h,'business-workflows-failure.json',{stage,checks,pending:journal.pending,error:error instanceof Error?{message:error.message,stack:error.stack}:String(error),lastFailure:journal.lastFailure});
  console.error('Local native business verification failed at '+stage+'; details are saved privately.');throw error;
 }
});
