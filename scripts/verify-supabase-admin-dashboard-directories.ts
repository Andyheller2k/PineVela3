/** Real, isolated PostgreSQL parity and authorization checks against an encrypted
 * genuine checkpoint. No fabricated accounts, mocked replies or cloud writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {administratorDashboardDirectories,checkAdministratorDashboardRequest} from '../supabase/adminDashboardDirectories.js';
import {adminResidenceRows} from '../supabase/residenceRegistration.js';
import {administratorManagerRestrictions,administratorStores} from '../supabase/adminStoreOverview.js';
import {housingDashboardRows} from '../supabase/dashboardReads.js';
import {administratorSellerApplications} from '../supabase/sellerRegistration.js';
import {paymentLedger} from '../supabase/payments.js';
import {accountDirectory} from '../supabase/accountReviews.js';

const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a genuine PostgreSQL backup UUID.');
let checks=0,stage='restore';
const check=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;};
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};};
async function denied(work:()=>unknown|Promise<unknown>,status:number,label:string){
  let failure:unknown;try{await work();}catch(error){failure=error;}
  check(failure instanceof ApiError&&failure.status===status,label);
}

try {
  await withIsolatedBackup(checkpoint,async config=>{
    const db=new SupabaseDatabase(config);
    try {
      const fingerprint=async()=>{
        const tables=(await db.pool.query(`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where c.relkind='r' and n.nspname in('auth','public','private') order by n.nspname,c.relname`)).rows;
        const snapshot:Record<string,unknown>={};
        const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
        for(const table of tables)snapshot[table.nspname+'.'+table.relname]=(await db.pool.query(
          'select count(*)::integer as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\'::jsonb)::text) as digest from '+
          quote(table.nspname)+'.'+quote(table.relname)+' t')).rows[0];
        return snapshot;
      };
      const before=await fingerprint();
      const actors=(await db.pool.query(`select distinct on(c.id) s.auth_user_id as "authUserId",s.session_id as "sessionId",
        s.active_context_id as "contextId",c.kind from private.account_sessions s
        join auth.sessions live on live.id=s.session_id and live.user_id=s.auth_user_id
        join public.account_contexts c on c.id=s.active_context_id and c.auth_user_id=s.auth_user_id
        where c.status='active' and (live.not_after is null or live.not_after>clock_timestamp())
          and private.portal_session_allowed(c.id,s.portal_pin_version)
          and private.account_session_allowed(c.id,s.session_id)
          and(c.kind<>'admin' or private.administrator_session_allowed(c.id,s.session_id)
            and exists(select 1 from public.admin_memberships m where m.context_id=c.id and m.status='active'))
        order by c.id,live.created_at desc`)).rows as VerifiedActor[];
      const administrators=actors.filter(actor=>actor.kind==='admin'),primary=actors.find(actor=>actor.kind==='primary');
      check(administrators.length>=2&&primary,'Real checkpoint has two active administrator bindings and an active primary binding');
      const [owner,other]=administrators;

      stage='exact projection parity';
      const expected={
        residences:await db.authorizedRead(owner,['admin'],client=>adminResidenceRows(client,owner)),
        managerRestrictions:await db.authorizedRead(owner,['admin'],client=>administratorManagerRestrictions(client,owner)),
        boardRequests:await db.readActor(owner,client=>housingDashboardRows(client,'board')),
        activities:await db.readActor(owner,client=>housingDashboardRows(client,'activities')),
        digitalMarketApps:await db.readActor(owner,administratorSellerApplications),
        digitalMarketStores:await db.authorizedRead(owner,['admin'],client=>administratorStores(client,owner)),
        paymentRecords:await db.authorizedRead(owner,['admin'],client=>paymentLedger(client,owner)),
        allUsersData:await db.authorizedRead(owner,['admin'],client=>accountDirectory(client,owner)),
      };
      const scopes:{kind:string;role:string}[]=[];
      let transactions=0;
      // Observe actual transaction entry/SQL roles without replacing SQL results
      // or authorization. Every callback still runs in its real native wrapper.
      class ObservedDatabase extends SupabaseDatabase {
        override async system<T>(work:(client:PoolClient)=>Promise<T>,admission?:Parameters<SupabaseDatabase['system']>[1]) {
          transactions++;return super.system(work,admission);
        }
        override async authorizedRead<T>(actor:VerifiedActor,kinds:string[],work:(client:PoolClient)=>Promise<T>) {
          return super.authorizedRead(actor,kinds,async client=>{
            scopes.push({kind:'administrator',role:(await client.query('select current_user as role')).rows[0].role});
            return work(client);
          });
        }
        override async readActor<T>(actor:VerifiedActor,work:(client:PoolClient)=>Promise<T>) {
          return super.readActor(actor,async client=>{
            scopes.push({kind:'scoped',role:(await client.query('select current_user as role')).rows[0].role});
            return work(client);
          });
        }
      }
      const observed=new ObservedDatabase(config);
      let actual:Awaited<ReturnType<typeof administratorDashboardDirectories>>;
      try {actual=await administratorDashboardDirectories(observed,owner);}finally{await observed.close();}
      for(const key of Object.keys(expected) as (keyof typeof expected)[]){
        assert.deepEqual(plain(actual![key]),plain(expected[key]),key+' matches its existing native projection exactly');checks++;
      }
      check(transactions===2&&scopes.length===2,'Eight directory projections use exactly two actual authorized transactions');
      check(scopes.some(scope=>scope.kind==='scoped'&&scope.role==='pinevela_backend'),
        'Housing and seller application reads keep the actual non-BYPASSRLS backend role');
      check(scopes.some(scope=>scope.kind==='administrator'&&scope.role!=='pinevela_backend'),
        'Privileged administrator projections remain in the separate authorized-read scope');
      check(actual!.allUsersData.users.length>0,'Genuine account directory remains populated');
      check(!/"(?:password|[^" ]*_hash|access_token|refresh_token|session_id|approvalKey|settingsKey)"\s*:/.test(JSON.stringify(actual!)),
        'Consolidated response includes no private credential or provider session fields');

      stage='request selector and identity denial';
      checkAdministratorDashboardRequest(owner,{},owner.contextId,owner.contextId);checks++;
      checkAdministratorDashboardRequest(owner,{},undefined,undefined);checks++;
      for(const key of ['userId','profileId','managerId','hostelId','sellerId','staffId','roomId','bedId','accountId'])
        await denied(()=>checkAdministratorDashboardRequest(owner,{[key]:other.contextId},owner.contextId,owner.contextId),400,
          'Query identity selector '+key+' cannot choose another directory scope');
      for(const captured of [other.contextId,[owner.contextId],owner.contextId+','+other.contextId]){
        await denied(()=>checkAdministratorDashboardRequest(owner,{},captured,owner.contextId),409,'Stale or repeated profile context is rejected');
        await denied(()=>checkAdministratorDashboardRequest(owner,{},owner.contextId,captured),409,'Stale or repeated account context is rejected');
      }
      await denied(()=>administratorDashboardDirectories(db,primary!),403,'Actual primary portal cannot read administrator directories');
      for(const forged of [
        {...owner,authUserId:primary!.authUserId},
        {...owner,contextId:other.contextId},
        {...owner,sessionId:other.sessionId},
        {...primary!,kind:'admin'},
      ])await denied(()=>administratorDashboardDirectories(db,forged),401,'Forged identity/context/session/kind fails the live actor binding');

      stage='shared reader and exclusive governance boundaries';
      const held=deferred(),release=deferred();
      const blocker=db.system(async client=>{
        await client.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
        held.resolve();await release.promise;
      });
      await held.promise;
      let finished=false;
      const pending=administratorDashboardDirectories(db,owner).then(result=>{finished=true;return result;});
      try {
        const deadline=Date.now()+5000;let waiting=0;
        while(Date.now()<deadline){
          waiting=(await db.pool.query(`select count(*)::integer as count from pg_locks
            where locktype='advisory' and not granted and mode='ShareLock'
              and objsubid=1 and classid::bigint=((hashtextextended('platform-settings',0)>>32)&4294967295)
              and objid::bigint=(hashtextextended('platform-settings',0)&4294967295)`)).rows[0].count;
          if(waiting===2)break;
          await new Promise(done=>setTimeout(done,20));
        }
        check(waiting===2&&!finished,'Both real read groups wait behind an exclusive administrator governance lock');
      } finally {release.resolve();await blocker;await pending;}
      check(finished,'Both directory read groups complete after governance lock release');

      stage='batched transaction role cleanup';
      const one=new SupabaseDatabase({...config,max:1});
      const initial=(await one.statement("select current_user as role,current_setting('request.jwt.claims',true) as claims")).rows[0];
      try{
        const role=await one.readActor(owner,async client=>(await client.query('select current_user as role')).rows[0].role);
        check(role==='pinevela_backend','Batched setup still enters the scoped RLS role');
        let state=(await one.statement("select current_user as role,current_setting('request.jwt.claims',true) as claims")).rows[0];
        check(state.role===initial.role&&!state.claims,'Commit clears the role and claims before reusing the same connection');
        const abort=new Error('Deliberate operation failure');
        await assert.rejects(()=>one.readActor(owner,async client=>{await client.query('select current_user');throw abort;}),error=>error===abort);checks++;
        state=(await one.statement("select current_user as role,current_setting('request.jwt.claims',true) as claims")).rows[0];
        check(state.role===initial.role&&!state.claims,'Rollback clears the role and claims before reusing the same connection');
      }finally{await one.close();}
      assert.deepEqual(await fingerprint(),before,'All genuine Auth, business and private table contents remain byte exact');checks++;
      const result={passed:true,checks,genuineCheckpoint:true,isolatedNative:true,projectionParity:8,
        aggregateTransactions:transactions,rlsRolePreserved:true,liveBindingPreserved:true,governanceExclusionPreserved:true,
        archivedRowsUnchanged:true,cloudRecordsModified:0,providerRepliesMocked:false,paystackRequests:0};
      fs.writeFileSync('.security/migration-reset/administrator-dashboard-directories-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
      console.log(JSON.stringify(result));
    } finally {await db.close();}
  });
} catch(error:any) {
  fs.writeFileSync('.security/migration-reset/administrator-dashboard-directories-failure.log',String(error.stack||error),{mode:0o600});
  console.error(JSON.stringify({passed:false,stage,checks,code:error.code||null,
    error:error instanceof assert.AssertionError?error.message:'Native dashboard directory verification failed; diagnostics saved privately.'}));
  process.exitCode=1;
}
