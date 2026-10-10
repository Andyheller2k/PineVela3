/** Isolated genuine Auth restore. No cloud membership, JWT, provider response or email is fabricated. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { SupabaseDatabase,ApiError,type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { hashCredentialAsync } from '../accountSecurity.js';
import { SupabaseAdminGovernance,governanceStatus,checkApprovalKey } from '../supabase/adminGovernance.js';
import { SupabaseAdminInvitations,administratorInvitationToken,acceptAdministratorInvitation,inspectAdministratorInvitation } from '../supabase/adminInvitations.js';
import { validateLoginContinuation,validatePublicContinuation } from '../publicContinuation.js';
dotenv.config({quiet:true});const checkpoint=process.argv[2];if(!checkpoint)throw new Error('Pass the migration-27 encrypted checkpoint UUID.');
let checks=0,stage='fixture';const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);}
try{await withIsolatedBackup(checkpoint,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    const f=await db.system(async c=>{
      const ledger=(await c.query('select version,digest from private.schema_migrations')).rows;check(ledger.length===27,'Private credentials are seeded before enrollment guards');
      for(const row of ledger){const file=fs.readdirSync('supabase/migrations').find(x=>x.startsWith(row.version));check(file&&crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations',file))).digest('hex')===row.digest,'Historical migration digest is immutable');}
      const people=(await c.query(`select distinct on(u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
        join auth.identities i on i.user_id=u.id and i.provider='google' where u.email_confirmed_at is not null and not u.is_anonymous
        and (s.not_after is null or s.not_after>clock_timestamp()) order by u.id,s.created_at desc limit 4`)).rows;
      check(people.length===4,'Four genuine verified Google subjects required');
      const admins:VerifiedActor[]=[],keys:string[]=[],settings:string[]=[];let recipient!:VerifiedActor,ownerPrimary!:VerifiedActor;
      for(const [index,p] of people.entries()){
        await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
        const primary=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
        let actor:VerifiedActor={authUserId:p.id,sessionId:p.session_id,contextId:primary,kind:'primary'};
        if(index<3){if(index===0)ownerPrimary={...actor};actor={...actor,kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id};
          await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[actor.contextId,index+1]);
          const key=crypto.randomBytes(32).toString('base64url'),setting=crypto.randomBytes(32).toString('base64url');keys.push(key);settings.push(setting);admins.push(actor);
          await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at) values($1,$2,clock_timestamp(),$3,clock_timestamp())',
            [actor.contextId,await hashCredentialAsync(`approval:${actor.contextId}:${key}`),await hashCredentialAsync(`settings:${actor.contextId}:${setting}`)]);
        }else recipient=actor;
        await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[actor.sessionId,actor.authUserId,actor.contextId]);
      }
      const other=(await c.query('select id,email from auth.users where id<>all($1::uuid[]) order by id limit 1',[people.map(p=>p.id)])).rows[0];check(Boolean(other?.email),'A fifth genuine Auth mailbox exists for reservation tests');
      const legacy=(await c.query(`insert into private.admin_invitations(invited_email,reserved_slot,invitation_digest,created_by_context_id,expires_at)
        values($1,4,$2,$3,clock_timestamp()+interval '1 day') returning id`,[people[3].email.toLowerCase(),crypto.randomBytes(32).toString('hex'),admins[0].contextId])).rows[0].id;
      for(const file of fs.readdirSync('supabase/migrations').filter(x=>/^\d{14}.*\.sql$/.test(x)&&x.slice(0,14)>'20261009220000').sort()){
        const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);}
      return {admins,keys,settings,recipient,ownerPrimary,other,legacy,person:people[3],authTimes:JSON.stringify((await c.query('select id,created_at from auth.sessions order by id')).rows)};
    });
    const [founder,second,third]=f.admins;let auth=new SupabaseAuth(db),service=new SupabaseAdminInvitations(auth);
    const view=(a=founder)=>db.authorizedSystem(a,['admin'],c=>governanceStatus(c,a));
    const create=(email=f.person.email,key=f.keys[0],a=founder)=>service.create(a,{name:f.person.raw_user_meta_data?.full_name||f.person.email,email,privateKey:key});
    const accept=(token:string,a=f.recipient)=>db.authorizedSystem(a,['primary'],c=>acceptAdministratorInvitation(c,a,administratorInvitationToken(token)));
    const inspect=(token:string,a=f.recipient)=>db.authorizedSystem(a,['primary'],c=>inspectAdministratorInvitation(c,a,administratorInvitationToken(token)));
    stage='authorization';
    check((await view()).capabilities.invitations,'Status enables invitations');check((await view(second)).invitations===undefined,'Other administrators cannot read private invitations');
    check((await db.pool.query('select cancellation_reason from private.admin_invitations where id=$1',[f.legacy])).rows[0].cancellation_reason==='legacy_protocol','Unreviewed legacy invitations cannot grant membership');
    await denied(()=>create(f.person.email,f.keys[1],second),403,'An ordinary administrator cannot invite');
    await denied(()=>create(f.person.email,f.settings[0]),403,'Settings key cannot authorize invitations');
    await denied(()=>service.create(founder,{name:f.person.email,email:f.person.email,privateKey:f.keys[0],slot:1,userId:f.person.id}),400,'Client cannot choose ownership or founder slot');
    await denied(async()=>create((await db.pool.query('select email from auth.users where id=$1',[second.authUserId])).rows[0].email),409,'Existing administrator identities cannot be reinvited');
    const invitation=await create(f.person.email.toUpperCase());
    check(invitation.slot===4&&invitation.email===f.person.email.toLowerCase()&&invitation.invitationToken.length===43,'Founder reserves the first real free slot with a normalized mailbox');
    const row=(await db.pool.query('select * from private.admin_invitations where id=$1',[invitation.invitationId])).rows[0];
    check(row.invited_auth_user_id===f.person.id,'Existing mailbox is bound to the exact genuine Auth UUID');
    check(row.invitation_digest===administratorInvitationToken(invitation.invitationToken)&&row.invitation_digest!==invitation.invitationToken,'Only token digest is persisted');
    check(new Date(row.expires_at).getTime()-new Date(row.created_at).getTime()===86400000,'SQL fixes the exact 24-hour window');
    check(!JSON.stringify(await view()).includes(invitation.invitationToken)&&!JSON.stringify(await view()).includes(row.invitation_digest),'Status exposes no invitation grants');
    await denied(()=>create(),409,'Duplicate recipient reservation denied');
    const other=await create(f.other.email);check(other.slot===5,'Next invitation reserves the other free slot');
    check((await db.pool.query("select (select count(*) from public.admin_memberships)+(select count(*) from private.admin_invitations where accepted_at is null and cancelled_at is null) as occupied")).rows[0].occupied==='5','Occupied and reserved slots together cannot exceed five');
    await denied(()=>create(f.person.email,f.keys[0],third),403,'Third administrator cannot create invitations using founder credentials');
    await denied(()=>inspect(other.invitationToken),403,'Wrong mailbox cannot inspect an invitation');
    await denied(()=>accept(other.invitationToken),403,'Wrong mailbox cannot accept a stolen private link');
    await denied(()=>inspect(crypto.randomBytes(32).toString('base64url')),403,'Unknown grant is unavailable without revealing recipient information');
    await denied(()=>Promise.resolve(administratorInvitationToken('invalid')),400,'Malformed private tokens rejected');
    check((await inspect(invitation.invitationToken)).reserved_slot===4,'Actual invited verified account can inspect its reserved slot');
    await denied(()=>db.system(c=>c.query("update private.admin_invitations set expires_at=expires_at+interval '1 day' where id=$1",[row.id])),'42501','Server deadline cannot be extended');
    await denied(()=>db.system(c=>c.query('delete from private.admin_invitations where id=$1',[row.id])),'42501','Invitation history cannot be deleted');
    await denied(()=>db.system(c=>c.query('update private.admin_invitations set cancelled_at=clock_timestamp() where id=$1',[row.id])),'42501','Raw cancellation cannot bypass the founder approval key');
    await denied(()=>db.system(c=>c.query('update private.admin_invitations set accepted_at=clock_timestamp() where id=$1',[row.id])),'42501','Raw SQL cannot consume a grant without verified membership');
    await denied(()=>db.authorizedSystem(f.recipient,['primary'],async c=>{const target=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[f.recipient.authUserId])).rows[0].id;
      await c.query('insert into public.admin_memberships(context_id,slot) values($1,4)',[target]);}),'42501','Raw administrator insertion requires the reviewed private grant');
    check((await db.pool.query("select count(*) from public.account_contexts where auth_user_id=$1 and kind='admin'",[f.recipient.authUserId])).rows[0].count==='0','Failed raw grant leaves no admin context');
    stage='cancellation';await denied(()=>service.cancel(second,other.invitationId,{privateKey:f.keys[1]}),403,'Only founder can cancel');
    await service.cancel(founder,other.invitationId,{privateKey:f.keys[0]});await denied(()=>accept(other.invitationToken),403,'Cancelled link cannot be accepted');
    const afterCancel=await create(f.other.email);check(afterCancel.slot===5,'Cancellation releases the reserved slot');
    await denied(()=>db.system(c=>c.query("update public.admin_memberships set status='suspended' where context_id=$1",[founder.contextId])),'42501','The founder invitation issuer cannot be suspended');
    await service.cancel(founder,invitation.invitationId,{privateKey:f.keys[0]});
    await service.cancel(founder,afterCancel.invitationId,{privateKey:f.keys[0]});
    await denied(()=>accept(invitation.invitationToken),403,'A cancelled reservation cannot be revived');
    check((await db.pool.query('select cancellation_reason from private.admin_invitations where id=$1',[afterCancel.invitationId])).rows[0].cancellation_reason==='cancelled','Cancellation closes the other reservation');
    // Continue rollback/concurrency checks with a newly reviewed real recipient grant.
    const fresh=await create();invitation.invitationToken=fresh.invitationToken;invitation.invitationId=fresh.invitationId;row.id=fresh.invitationId;
    const reused=await create(f.other.email);
    stage='rollback';await denied(()=>db.authorizedSystem(f.recipient,['primary'],async c=>{await acceptAdministratorInvitation(c,f.recipient,administratorInvitationToken(invitation.invitationToken));
      await c.query('insert into public.notification_recipients(notification_id,context_id) values(gen_random_uuid(),$1)',[founder.contextId]);}),'23503','A late failure rolls back acceptance, membership, keys and notices');
    check((await db.pool.query('select accepted_at from private.admin_invitations where id=$1',[row.id])).rows[0].accepted_at===null,'Rollback preserves the unconsumed grant');
    check((await db.pool.query('select count(*) from public.admin_memberships')).rows[0].count==='3','Rollback preserves the original roster');
    stage='concurrent acceptance';const attempts=await Promise.allSettled([accept(invitation.invitationToken),accept(invitation.invitationToken)]);
    check(attempts.filter(x=>x.status==='fulfilled').length===1&&attempts.filter(x=>x.status==='rejected'&&x.reason instanceof ApiError&&x.reason.status===403).length===1,'Concurrent redemption creates exactly one administrator');
    const accepted=attempts.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<any>;check(accepted.value.slot===4&&accepted.value.keyEnrollmentRequired&&!accepted.value.privateKey,'Membership acceptance cannot manufacture an approval key');
    const newAdmin={...f.recipient,contextId:accepted.value.id,kind:'admin'};
    check((await db.pool.query('select approval_key_hash,settings_key_hash from private.admin_secrets where context_id=$1',[newAdmin.contextId])).rows[0].approval_key_hash===null,'New administrator must enroll their own separate keys');
    check((await db.pool.query("select count(*) from public.notifications where title='Administrator invitation accepted'")).rows[0].count==='1','Acceptance emits one Approvals notice');
    check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Administrator invitation accepted'")).rows[0].count==='4','Exact active roster including new member receives acceptance');
    await denied(()=>service.cancel(founder,row.id,{privateKey:f.keys[0]}),409,'Consumed invitation cannot be cancelled');
    await denied(()=>db.system(c=>c.query('update private.admin_invitations set accepted_at=null,accepted_context_id=null where id=$1',[row.id])),'42501','Consumed grants cannot be reopened');
    stage='private access';await denied(()=>db.actor(second,c=>c.query('select * from private.admin_invitations')),'42501','Backend/browser role cannot read invitation grants');
    await denied(()=>db.system(async c=>{await c.query('set local role anon');await c.query('select * from private.admin_invitations');}),'42501','Guest cannot read invitations');
    await denied(()=>db.system(async c=>{await c.query('set local role authenticated');await c.query('select private.invitation_identity_valid($1,$2)',[f.recipient.authUserId,f.person.email]);}),'42501','Browser cannot invoke privileged identity checks');
    stage='restart';await db.close();db=new SupabaseDatabase(config);auth=new SupabaseAuth(db);service=new SupabaseAdminInvitations(auth);
    check((await db.pool.query('select count(*) from public.admin_memberships')).rows[0].count==='4','Membership survives backend pool restart');
    await denied(()=>accept(invitation.invitationToken),403,'One-time acceptance survives restart');
    stage='issuer recovery';const recovery=new SupabaseAdminGovernance(auth);
    const proposal=await recovery.propose(second,founder.contextId,{action:'reset-key',reason:'Recover administrator approval key',privateKey:f.keys[1]});
    await recovery.vote(third,proposal.id,{decision:'approved',privateKey:f.keys[2]});
    const after=await view(second);check(after.mainId===founder.contextId,'Founder recovery preserves main membership');
    check((await db.pool.query('select cancellation_reason from private.admin_invitations where id=$1',[reused.invitationId])).rows[0].cancellation_reason==='issuer_changed','Recovered issuer key invalidates outstanding invitations');
    check((await db.pool.query('select count(*) from auth.users')).rows[0].count==='5','No Auth account is created or restored into production');
    check(JSON.stringify((await db.pool.query('select id,created_at from auth.sessions order by id')).rows)===f.authTimes,'No Auth session timestamp is fabricated');
    const continuation=`/admin-invitation?token=${invitation.invitationToken}`;
    check(validateLoginContinuation(continuation)===continuation,'Private invited flow resumes after verified sign-in');
    check(!validatePublicContinuation(continuation),'Catalog persistence never stores an invitation grant');
    for(const input of ['https://evil.invalid/'+continuation,'//evil.invalid',continuation+'&role=admin',continuation+'#fragment','/admin-invitation?token=invalid'])check(!validateLoginContinuation(input),'Redirect rejects foreign origins, malformed tokens and added claims');
    console.log(JSON.stringify({checks,passed:true,isolatedRestore:true,cloudRecordsModified:0,authAccountsCreated:0,authSessionTimesChanged:0,providerMocks:0,
      providerAcceptance:'Real Google/email sign-in and invitation UI remain acceptance gates; private links are manually shared.'}));
  }finally{await db.close();}
});}catch(error:any){console.error(JSON.stringify({passed:false,stage,sqlState:error?.code||null,assertion:error?.code==='ERR_ASSERTION'?error.message:undefined}));process.exitCode=1;}
