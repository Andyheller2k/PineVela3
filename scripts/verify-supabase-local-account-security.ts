/** Actual local Auth/SMTP/Storage and native HTTP authorization. All mutations
 * target explicitly created dummy identities in the owned disposable stack. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createLocalPrimary,readLocalFixture,saveLocalFixture,signInLocalAccount,runLocalSupabaseVerification,
 type LocalAccountCredentials} from './lib/local-supabase-harness.js';
let checks=0,stage='owned dummy identities';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
try{await runLocalSupabaseVerification(async h=>{
 const a=await createLocalPrimary(h,'security-owner-a'),b=await createLocalPrimary(h,'security-owner-b');
 const fixtures=readLocalFixture<{administrators:LocalAccountCredentials[]}>(h,'administrator-fixtures.json');assert.ok(fixtures?.administrators.length);
 const admin=(await signInLocalAccount(h,fixtures.administrators[0],'admin')).session;
 const guest=h.session();
 stage='profile and photograph isolation';
 check((await a.session.json('/api/auth/profile',{avatar:'preset:pine-violet'},'PUT')).status===200,'Own supported avatar preset saves');
 check((await b.session.json('/api/auth/profile',{avatar:'preset:pine-emerald'},'PUT')).status===200,'Separate account saves its own preset');
 for(const body of[{userId:b.user.profileId,name:'Spoofed name'},{profileId:b.user.profileId},{role:'admin'},{email:b.credentials.email}])
  check((await a.session.json('/api/auth/profile',body,'PUT')).status===400,'Client identity and role changes cannot rewrite profiles');
 check((await a.session.request('/api/auth/profile',{method:'PUT',headers:{'content-type':'application/json','x-pinevela-profile-context':b.user.id},body:JSON.stringify({avatar:'preset:pine-dark'})})).status===409,'Stale context header cannot save to another profile');
 check((await admin.json('/api/auth/profile',{avatar:'preset:pine-dark'},'PUT')).status===403,'Administrator profile edits require the separate settings key');
 check((await b.session.request('/api/auth/me')).data?.avatar==='preset:pine-emerald','Foreign profile attempts leave the other avatar unchanged');
 const png=await sharp({create:{width:96,height:96,channels:4,background:{r:31,g:91,b:161,alpha:1}}}).png().toBuffer();
 const uploadBody={fileData:png.toString('base64'),fileType:'image/png',fileName:'local-owned-avatar.png'};
 const uploaded=await a.session.json('/api/storage/upload-profile-image',uploadBody);
 check(uploaded.status===201&&uploaded.data?.storageType==='supabase-private','Real local Storage accepts an authorized dummy image');
 const avatar=uploaded.data.imageUrl;
 check((await a.session.request(avatar)).status===200,'The actual image owner can read stored bytes');
 check((await b.session.request(avatar)).status===404,'Another verified identity cannot read the private avatar');
 check((await guest.request(avatar)).status===404,'A guest cannot read the private avatar');
 check((await b.session.json('/api/auth/profile',{avatar},'PUT')).status===403,'Another identity cannot attach the owned asset to its profile');
 check((await a.session.json('/api/auth/profile',{avatar},'PUT')).status===200,'The actual owner can attach its ready stored avatar');
 check((await a.session.request('/api/auth/me')).data?.avatar===avatar,'Owned avatar survives a fresh profile read');
 const reused=await a.session.json('/api/storage/upload-profile-image',uploadBody);
 check(reused.status===201&&reused.data?.reused===true&&reused.data?.assetId===uploaded.data.assetId,'Retrying identical avatar bytes reuses the actual ready object');

 stage='administrator recipient review and notification separation';
 const selection={groups:[],accounts:[{id:a.user.id,role:'user'}]};
 check((await a.session.json('/api/admin/messages/preview',selection)).status===403,'Primary accounts cannot preview administrator recipients');
 check((await admin.json('/api/admin/messages/preview',{groups:[],accounts:[{id:a.user.id,role:'student'}]})).status===409,'Recipient type must match its real native context');
 const preview=await admin.json('/api/admin/messages/preview',selection);
 check(preview.status===200&&preview.data?.count===1&&preview.data?.counts?.user===1,'Real administrator preview selects exactly the intended primary');
 const content={title:'Local account security '+h.meta.runId,message:'Disposable native recipient isolation verification.',type:'info',fingerprint:preview.data.fingerprint};
 check((await admin.json('/api/admin/messages',{...selection,accounts:[{id:b.user.id,role:'user'}],...content})).status===409,'Preview cannot be reused for a different recipient');
 const sent=await admin.json('/api/admin/messages',{...selection,...content});
 check(sent.status===200&&sent.data?.count===1,'Reviewed native announcement reaches exactly one actual recipient');
 const repeated=await admin.json('/api/admin/messages',{...selection,...content});
 check(repeated.status===200&&repeated.data?.batchId===sent.data.batchId,'An identical delivery retry remains the same native batch');
 const notices=await a.session.request('/api/notifications'),otherBefore=await b.session.request('/api/notifications');
 const notice=notices.data?.find((n:any)=>n.title===content.title);assert.ok(notice);
 check(!otherBefore.data?.some((n:any)=>n.id===notice.id),'Another account cannot list the targeted notification');
 check((await b.session.json('/api/notifications/'+notice.id+'/read',{},'PUT')).status===404,'Another account cannot mark the targeted notification read');
 check((await b.session.json('/api/admin-messages/'+notice.id+'/ack',{})).status===404,'Another account cannot acknowledge the recipient popup');
 check((await a.session.json('/api/notifications/'+notice.id+'/read',{},'PUT')).status===200,'The actual recipient can mark its own notification read');
 check((await a.session.json('/api/admin-messages/'+notice.id+'/ack',{})).status===200,'The actual recipient can acknowledge its own popup');
 check(!(await a.session.request('/api/admin-messages/pending')).data?.some((n:any)=>n.id===notice.id),'Acknowledgement removes only its own pending popup');
 check(JSON.stringify((await b.session.request('/api/notifications')).data)===JSON.stringify(otherBefore.data),'Recipient read and popup operations leave the other inbox byte exact');

 stage='retired routes and public staff restrictions';
 const retired=['/api/auth/register-staff','/api/chat/profile','/api/chat/messages','/api/chat/dms','/api/chat/dms/request',
  '/api/chat/dms/accept','/api/chat/students','/api/staff-chat/rooms','/api/staff-chat/rooms/id/messages',
  '/api/student-messages','/api/accredited-staff','/api/staff-applications','/api/staff-applications/id/decision',
  '/api/staff-job-offers','/api/job-offers','/api/job-offers/id/accept','/api/staff-verifications/my-status',
  '/api/admin/staff-verifications','/api/hostels/'+crypto.randomUUID()+'/recruitment'];
 const fallbackStatuses=new Set<number>();
 for(const route of retired)for(const method of ['GET','POST','PUT']){
  const result=await a.session.request(route,{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:'{}'})});
  check([404,410,503].includes(result.status),'Retired chat/recruitment URL cannot activate a native operation');fallbackStatuses.add(result.status);
 }
 check((await guest.json('/api/staff',{})).status===401,'Staff creation is not public');
 check((await a.session.json('/api/staff',{})).status===403,'A primary account cannot create staff');
 check((await admin.json('/api/staff',{})).status===403,'Administrator identity cannot impersonate an authorized hostel manager for staff creation');
 check((await guest.json('/api/staff-reviews',{})).status===401,'Staff reviews are not public');
 check((await a.session.json('/api/staff-reviews',{})).status===403,'Primary accounts cannot bypass the activated resident review relationship');
 const obsolete=(await h.db.pool.query(`select n from unnest($1::text[]) n where to_regclass('public.'||n) is not null`,
  [['chat_messages','chat_rooms','chat_dms','student_messages','staff_chat_rooms','staff_job_offers','staff_applications']])).rows;
 check(obsolete.length===0,'The actual native schema has no retired generic chat or public recruitment tables');
 console.log(JSON.stringify({localSecurityProgress:true,stage:'profiles Storage inbox and retired routes verified',checks}));

 stage='captured recovery proof wrong identity and single use';
 const beforeRecovery=Date.now();
 check((await guest.json('/api/auth/recover',{email:a.credentials.email})).status===202,'Actual local provider accepts an own-email recovery request');
 const wrongProof=h.providerOrigin+await h.mail.recovery(a.credentials.email,beforeRecovery);
 const candidate=crypto.randomBytes(30).toString('base64url')+'aA1!';
 check((await guest.json('/api/auth/recover/complete',{email:b.credentials.email,code:wrongProof,newPassword:candidate})).status===400,'Emailed recovery proof cannot reset another identity');
 check((await guest.json('/api/auth/recover/complete',{email:a.credentials.email,code:wrongProof,newPassword:candidate})).status===400,'A consumed wrong-identity proof cannot be reused');
 check((await signInLocalAccount(h,b.credentials,'primary')).user?.id===b.user.id,'Wrong-identity recovery leaves the other actual password valid');
 check((await a.session.request('/api/auth/me')).status===200,'Rejected recovery does not silently replace the existing app account');
 // Honor the provider's own per-mailbox resend interval instead of disabling it.
 const remaining=61000-(Date.now()-beforeRecovery);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
 stage='actual password recovery and old-session revocation';
 const secondRequest=Date.now();
 check((await guest.json('/api/auth/recover',{email:a.credentials.email})).status===202,'A fresh own recovery email can be requested after its real resend interval');
 const code=h.providerOrigin+await h.mail.recovery(a.credentials.email,secondRequest);
 saveLocalFixture(h,'account-security-password-attempt.json',{runId:h.meta.runId,email:a.credentials.email,newPassword:candidate,attemptedAt:Date.now()});
 const complete=await guest.json('/api/auth/recover/complete',{email:a.credentials.email,code,newPassword:candidate});
 check(complete.status===200&&complete.data?.signInRequired===true,'The actual captured proof updates only its verified local password');
 check(!complete.headers.has('set-cookie'),'Password recovery does not issue an application session');
 const oldPassword=a.credentials.password;a.credentials.password=candidate;saveLocalFixture(h,'primary-security-owner-a.json',a.credentials);
 check((await a.session.request('/api/auth/me')).status===401,'Password recovery immediately invalidates earlier app bindings');
 check((await guest.json('/api/auth/login',{email:a.credentials.email,password:oldPassword,accountKind:'primary'})).status===401,'The previous actual password is rejected');
 check((await signInLocalAccount(h,a.credentials,'primary')).user?.id===a.user.id,'The new actual password signs into the same owned profile');
 check((await guest.json('/api/auth/recover/complete',{email:a.credentials.email,code,newPassword:crypto.randomBytes(30).toString('base64url')+'aA1!'})).status===400,'Successful recovery proof cannot be reused for a second password change');
 await h.assertOwned();
 const result={passed:true,checks,actualGoTrue:true,actualCapturedRecoveryEmail:true,actualPrivateStorage:true,
  wrongIdentityRecoveryDenied:true,singleUseRecovery:true,passwordChangeRevokesBindings:true,
  profileAndAvatarOwnership:true,targetedNotificationSeparation:true,nativeRecipientPreview:true,
  retiredNativeRoutesInactive:true,retiredFallbackStatuses:[...fallbackStatuses],obsoleteNativeTables:obsolete.length,
  productAuthOverrides:0,providerRepliesFabricated:0,cloudRecordsModified:0};
 saveLocalFixture(h,'account-security-result.json',result);console.log(JSON.stringify(result));
});}catch(error){
 console.error(JSON.stringify({passed:false,stage,checks,error:'Actual local account security verification stopped; diagnostics remain private.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
