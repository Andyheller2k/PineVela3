import {termsAcceptance} from '../../legalPolicy.js';
/** Test-only real GoTrue/SMTP/HTTP harness. Never imported by product code.
 * The stack is started separately; this module refuses every remote endpoint. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {spawn,spawnSync} from 'node:child_process';
import type {AddressInfo} from 'node:net';
import {SupabaseDatabase,UUID} from '../../supabase/db.js';
import {createSupabaseApp} from '../../supabase/app.js';
import {installStaticFrontend} from '../../supabase/staticFrontend.js';

export type LocalSupabaseMetadata={version:1;runId:string;root:string;apiUrl:string;databaseUrl:string;
 mailUrl:string;anonKey:string;serviceRoleKey:string;databaseOwned:true};
const workerFlag='--local-supabase-worker';
let nextAuthRequestAt=0;
function privateDirectory(directory:string){
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.mode&0o077||fs.realpathSync(directory)!==directory)
  throw Error('A private real local-test directory is required.');
}
function privateFile(file:string){const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077||stat.size>1024*1024||fs.realpathSync(file)!==file)throw Error('Private local-test file required.');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
function savePrivate(file:string,bytes:string|Buffer){const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function loopback(value:string,protocol:'http:'|'postgresql:'){
 const url=new URL(value);
 if(url.protocol!==protocol||url.hostname!=='127.0.0.1'||!url.port||!/^\d+$/.test(url.port)
  ||Number(url.port)<1||Number(url.port)>65535||url.search||url.hash
  ||protocol==='http:'&&(url.username||url.password||url.pathname!=='/'))throw Error('Only explicit local-test loopback endpoints are accepted.');
 return url;
}
export function readLocalSupabaseMetadata(file:string):LocalSupabaseMetadata{
 if(!path.isAbsolute(file))throw Error('Pass the absolute private local-stack metadata path.');
 const value=JSON.parse(privateFile(file).toString()) as LocalSupabaseMetadata;
 if(value.version!==1||!UUID.test(value.runId)||value.databaseOwned!==true||!path.isAbsolute(value.root)
  ||!value.root.startsWith('/tmp/')||path.resolve(value.root)!==value.root
  ||!file.startsWith(value.root+path.sep))throw Error('Run-owned disposable stack metadata required.');
 privateDirectory(value.root);loopback(value.apiUrl,'http:');loopback(value.mailUrl,'http:');
 const db=loopback(value.databaseUrl,'postgresql:');
 if(!db.username||!db.password||!db.pathname.slice(1))throw Error('Explicit local database configuration required.');
 for(const key of [value.anonKey,value.serviceRoleKey])if(typeof key!=='string'||key.length<20)throw Error('Actual local provider keys required.');
 return value;
}
function prepareCredentials(meta:LocalSupabaseMetadata){
 const directory=path.join(meta.root,'pinevela-harness');
 if(!fs.existsSync(directory))fs.mkdirSync(directory,{mode:0o700});privateDirectory(directory);
 const cert=path.join(directory,'loopback.crt'),key=path.join(directory,'loopback.key'),pin=path.join(directory,'order-pin.key');
 if(!fs.existsSync(cert)&&!fs.existsSync(key)){
  const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','2',
   '-subj','/CN=PineVela disposable local test','-addext','subjectAltName=IP:127.0.0.1',
   '-keyout',key,'-out',cert],{stdio:'ignore',timeout:30000});
  if(result.status!==0)throw Error('Local test TLS certificate generation failed.');
  fs.chmodSync(cert,0o600);fs.chmodSync(key,0o600);
 }
 privateFile(cert);privateFile(key);
 if(!fs.existsSync(pin))savePrivate(pin,crypto.randomBytes(32));
 if(privateFile(pin).length!==32)throw Error('Invalid local-test delivery PIN key.');
 return{directory,cert,key,pin};
}
/** Cookies originate only in actual application Set-Cookie replies. */
export class LocalApiSession{
 private cookies=new Map<string,string>();
 constructor(readonly origin:string){}
 copy(){const next=new LocalApiSession(this.origin);next.cookies=new Map(this.cookies);return next;}
 async request(route:string,options:RequestInit={}){
  const url=new URL(route,this.origin);
  if(url.origin!==this.origin||!url.pathname.startsWith('/api/'))throw Error('Only this local application API can receive the test session.');
  const headers=new Headers(options.headers);
  // Respect the unchanged product's 20-auth-mutations/minute IP budget when
  // several disposable actors are prepared through the same test application.
  if((options.method||'GET').toUpperCase()==='POST'&&url.pathname.startsWith('/api/auth/')){
   const now=Date.now(),delay=Math.max(0,nextAuthRequestAt-now);nextAuthRequestAt=Math.max(now,nextAuthRequestAt)+3200;
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  }
  if(!headers.has('cookie')&&this.cookies.size)headers.set('cookie',[...this.cookies].map(([k,v])=>k+'='+v).join('; '));
  const response=await fetch(url,{...options,headers,redirect:'manual',signal:options.signal||AbortSignal.timeout(45000)});
  for(const line of response.headers.getSetCookie()){
   const first=line.split(';',1)[0],split=first.indexOf('=');if(split<1)continue;
   const name=first.slice(0,split),value=first.slice(split+1);
   if(/(?:^|;)\s*max-age=0(?:;|$)/i.test(line)||!value)this.cookies.delete(name);else this.cookies.set(name,value);
  }
  const data=await response.json().catch(()=>null);
  return{status:response.status,data,headers:response.headers};
 }
 json(route:string,body:unknown,method='POST'){return this.request(route,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
}

/** Reads only the separately started local capture server; never releases mail. */
export class LocalCapturedMail{
 constructor(private meta:LocalSupabaseMetadata){}
 private async read(route:string){const response=await fetch(new URL(route,this.meta.mailUrl),{redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;return response.json();}
 confirmation(email:string,after:number,timeoutMs=45000){return this.proof(email,after,['signup','email'],timeoutMs);}
 recovery(email:string,after:number,timeoutMs=45000){return this.proof(email,after,['recovery'],timeoutMs);}
 private async proof(email:string,after:number,types:string[],timeoutMs:number):Promise<string>{
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
   const listing=await this.read('/api/v1/messages');
   const messages=Array.isArray(listing?.messages)?listing.messages:[];
   for(const message of messages){
    if(!Array.isArray(message.To)||!message.To.some((to:any)=>String(to.Address||'').toLowerCase()===email.toLowerCase())
     ||!Number.isFinite(Date.parse(message.Created))||Date.parse(message.Created)<after-1000||!/^[a-zA-Z0-9-]+$/.test(message.ID||''))continue;
    const full=await this.read('/api/v1/message/'+encodeURIComponent(message.ID));
    const body=String(full?.HTML||'')+'\n'+String(full?.Text||'');
    for(const raw of body.match(/https?:\/\/[^\s"'<>]+/g)||[]){
     let link:URL;try{link=new URL(raw.replaceAll('&amp;','&'));}catch{continue;}
     const token=link.searchParams.get('token')||link.searchParams.get('token_hash'),type=link.searchParams.get('type');
     if(link.origin!==new URL(this.meta.apiUrl).origin||link.pathname!=='/auth/v1/verify'
      ||!types.includes(type||'')||!/^[a-f0-9]{56,64}$/.test(token||''))continue;
     // Preserve the real emailed secret; use the TLS proxy origin expected by
     // the unchanged application's provider-link validation.
     return '/auth/v1/verify?type='+encodeURIComponent(type!)+'&token='+encodeURIComponent(token!);
    }
   }
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Actual local confirmation mail did not arrive before the deadline.');
 }
}
export type LocalSupabaseHarness={meta:LocalSupabaseMetadata;db:SupabaseDatabase;origin:string;providerOrigin:string;
 mail:LocalCapturedMail;session:()=>LocalApiSession;assertOwned:()=>Promise<void>;
 bootstrapFounder:(session:LocalApiSession)=>Promise<string>};

export type LocalAccountCredentials={email:string;password:string;name:string;accountKind?:string;portalPin?:string;
 contextId?:string;role?:string;approvalKey?:string;settingsKey?:string};
export function localFixtureFile(h:LocalSupabaseHarness,name:string){
 if(!/^[a-zA-Z0-9-]+\.json$/.test(name))throw Error('Use a local fixture basename.');
 return path.join(h.meta.root,'pinevela-harness',name);
}
export function readLocalFixture<T>(h:LocalSupabaseHarness,name:string):T|undefined{
 const file=localFixtureFile(h,name);return fs.existsSync(file)?JSON.parse(privateFile(file).toString()) as T:undefined;
}
export function saveLocalFixture(h:LocalSupabaseHarness,name:string,value:unknown){
 const file=localFixtureFile(h,name);if(fs.existsSync(file))privateFile(file);
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';savePrivate(temporary,JSON.stringify(value,null,2)+'\n');fs.renameSync(temporary,file);
}
export async function signInLocalAccount(h:LocalSupabaseHarness,credentials:LocalAccountCredentials,accountKind=credentials.accountKind){
 await h.assertOwned();const session=h.session();
 const response=await session.json('/api/auth/login',{email:credentials.email,password:credentials.password,
  ...(accountKind?{accountKind}:{}),...(credentials.portalPin?{portalPin:credentials.portalPin}:{})});
 assert.equal(response.status,200,'Native local account sign-in succeeds');
 if(credentials.contextId)assert.equal(response.data?.id,credentials.contextId,'Sign-in returns this exact owned context');
 // Positive workflow fixtures explicitly accept only inside this owned local
 // stack. Negative consent tests call the HTTP session directly instead.
 if(response.data?.legal?.accepted!==true){
  await h.assertOwned();
  const accepted=await session.json('/api/legal/accept',{termsAcceptance:termsAcceptance(true)});
  assert.equal(accepted.status,200,'Owned positive fixture explicitly accepts current Terms');
  return{session,user:accepted.data};
 }
 return{session,user:response.data};
}
/** Reconciles actual Auth state before continuing a saved signup. A lost signup
 * response with no native row is never silently replayed. */
export async function createLocalPrimary(h:LocalSupabaseHarness,label:string){
 if(!/^[a-z][a-z0-9-]{0,30}$/.test(label))throw Error('Use a bounded local account label.');
 await h.assertOwned();const file='primary-'+label+'.json';
 let saved=readLocalFixture<LocalAccountCredentials&{startedAt:number;signupAttempted?:boolean;signupId?:string}>(h,file);
 if(!saved){saved={email:label+'-'+h.meta.runId.replaceAll('-','')+'@pinevela.test',
  password:crypto.randomBytes(30).toString('base64url')+'aA1!',name:'Local '+label,accountKind:'primary',startedAt:Date.now()};saveLocalFixture(h,file,saved);}
 let person=(await h.db.pool.query('select id,email_confirmed_at from auth.users where lower(email)=$1',[saved.email])).rows[0];
 if(!person){
  if(saved.signupAttempted)throw Error('Previous local signup outcome needs review before retrying.');
  saved.signupAttempted=true;saveLocalFixture(h,file,saved);
  const response=await h.session().json('/api/auth/register-unified',{termsAcceptance:termsAcceptance(true),name:saved.name,email:saved.email,password:saved.password});
  assert.equal(response.status,202,'Actual local primary signup requires confirmation');saved.signupId=response.data?.signupId;
  assert.ok(UUID.test(saved.signupId||''));saveLocalFixture(h,file,saved);
  person=(await h.db.pool.query('select id,email_confirmed_at from auth.users where id=$1',[saved.signupId])).rows[0];
 }
 assert.ok(person,'Actual local Auth subject exists');saved.signupId=person.id;
 if(!person.email_confirmed_at){
  const proof=await h.mail.confirmation(saved.email,saved.startedAt);
  const response=await h.session().json('/api/auth/verify-unified',{termsAcceptance:termsAcceptance(true),email:saved.email,signupId:person.id,code:h.providerOrigin+proof});
  assert.equal(response.status,200,'Actual local captured mail confirms the primary');
 }
 const signed=await signInLocalAccount(h,saved,'primary');
 assert.equal(signed.user?.role,'user');saved.contextId=signed.user.id;saved.role='user';saveLocalFixture(h,file,saved);
 return{credentials:saved,...signed};
}

async function openHarness(meta:LocalSupabaseMetadata,credentials:ReturnType<typeof prepareCredentials>,options:{staticFrontend?:boolean;moderation?:boolean;frontendDirectory?:string}){
 if(process.env.NODE_EXTRA_CA_CERTS!==credentials.cert||process.env.NODE_ENV!=='test')throw Error('Use the isolated local-test child process.');
 const target=new URL(meta.apiUrl);
 const proxy=https.createServer({cert:privateFile(credentials.cert),key:privateFile(credentials.key)},(req,res)=>{
  if(!/^\/(?:auth|storage|rest)\/v1(?:\/|\?|$)/.test(req.url||'')){res.writeHead(404).end();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:Number(target.port),method:req.method,path:req.url,
   headers:{...req.headers,host:target.host}},reply=>{res.writeHead(reply.statusCode||502,reply.headers);reply.pipe(res);});
  upstream.setTimeout(30000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
  req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
 });
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const providerOrigin='https://127.0.0.1:'+(proxy.address() as AddressInfo).port;
 Object.assign(process.env,{SUPABASE_URL:providerOrigin,SUPABASE_ANON_KEY:meta.anonKey,
  SUPABASE_SERVICE_ROLE_KEY:meta.serviceRoleKey,MARKET_ORDER_PIN_KEY_FILE:credentials.pin});
 const url=new URL(meta.databaseUrl);
 const db=new SupabaseDatabase({host:'127.0.0.1',port:Number(url.port),database:decodeURIComponent(url.pathname.slice(1)),
  user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),ssl:false,max:8,
  connectionTimeoutMillis:10000,statement_timeout:15000,query_timeout:30000});
 let server:http.Server|undefined,closeRealtime:(()=>Promise<void>)|undefined,closeSupport:(()=>Promise<void>)|undefined;
 try{
  const actual=(await db.pool.query('select host(inet_server_addr()) as host,inet_server_port() as port,current_database() as database')).rows[0];
  // The native CLI's loopback PostgreSQL gateway forwards to its own Unix
  // socket; PostgreSQL then reports both network fields as NULL. The client
  // destination remains the exact literal loopback endpoint validated above.
  assert.ok(actual.host==='127.0.0.1'&&actual.port===Number(url.port)
   ||actual.host===null&&actual.port===null,'Actual database must be local TCP or the owned gateway Unix connection');
  assert.equal(actual.database,decodeURIComponent(url.pathname.slice(1)));
  await db.system(async c=>{
   const exists=(await c.query("select to_regclass('pinevela_local_test.run_guard') is not null as exists")).rows[0].exists;
   if(!exists){
    const counts=(await c.query('select (select count(*) from auth.users)::int as users,(select count(*) from public.profiles)::int as profiles')).rows[0];
    assert.equal(counts.users,0,'First local test must start with no Auth identities');assert.equal(counts.profiles,0);
    await c.query('create schema pinevela_local_test; revoke all on schema pinevela_local_test from public,anon,authenticated; create table pinevela_local_test.run_guard(run_id uuid primary key); revoke all on pinevela_local_test.run_guard from public,anon,authenticated;');
    await c.query('insert into pinevela_local_test.run_guard(run_id) values($1)',[meta.runId]);
   }
  });
  const assertOwned=async()=>{const rows=(await db.pool.query('select run_id from pinevela_local_test.run_guard')).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].run_id,meta.runId,'Database belongs to this exact disposable run');};
  await assertOwned();
  const installed=(await db.pool.query("select version from private.schema_migrations where version='20261028120000'")).rowCount;
  assert.equal(installed,1,'The current immutable application migrations must be installed');
  const settings=await fetch(providerOrigin+'/auth/v1/settings',{headers:{apikey:meta.anonKey},signal:AbortSignal.timeout(10000)});
  assert.equal(settings.status,200,'Actual local GoTrue responds');const authSettings=await settings.json();
  assert.equal(authSettings.mailer_autoconfirm,false,'Actual local email confirmation remains enabled');
  assert.equal(authSettings.external?.email,true);
  const created=createSupabaseApp(db);closeRealtime=created.app.locals.closeRealtime;closeSupport=created.app.locals.closeSupport;
  if(options.staticFrontend){
   const directory=path.resolve(options.frontendDirectory || 'dist-supabase');assert.ok(fs.statSync(path.join(directory,'index.html')).isFile(),'Build the actual Supabase frontend first');
   created.app.use((req,res,next)=>{let pathname:string;try{pathname=path.posix.normalize(decodeURIComponent(req.path));}catch{return res.sendStatus(400);}
    return /^\/(?:\.security|\.git|data|uploads|\.env|dist-supabase-backend)(?:[/.]|$)/i.test(pathname)
     ||/^\/(?:(?:supabase-server|residence-worker|system-wipe-worker)\.mjs|server\.cjs)(?:\.map)?$/i.test(pathname)?res.sendStatus(404):next();});
   installStaticFrontend(created.app,directory);
  }
  server=created.app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
  const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  const harness:LocalSupabaseHarness={meta,db,origin,providerOrigin,mail:new LocalCapturedMail(meta),
   session:()=>new LocalApiSession(origin),assertOwned,
   bootstrapFounder:async session=>{
    await assertOwned();const me=await session.request('/api/auth/me');
    assert.equal(me.status,200);assert.equal(me.data?.role,'user','Local founder begins as an actual signed-in primary');
    return db.system(async c=>{
     assert.equal((await c.query('select count(*)::int as count from public.admin_memberships')).rows[0].count,0,'Only the first local founder is bootstrapped');
     const person=(await c.query(`select c.auth_user_id from public.account_contexts c join auth.users u on u.id=c.auth_user_id
      where c.id=$1 and c.kind='primary' and c.status='active' and u.email_confirmed_at is not null and not u.is_anonymous
       and lower(u.email) like $2`,[me.data.id,'%'+meta.runId.replaceAll('-','')+'@pinevela.test'])).rows[0];
     assert.ok(person,'Only this run dummy primary can bootstrap the local founder');
     const context=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[person.auth_user_id])).rows[0].id;
     await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[context]);
     await c.query('insert into private.admin_secrets(context_id) values($1)',[context]);
     await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'local_test_founder_bootstrap','profile',$2)",[context,person.auth_user_id]);
     return context;
    });
   }};
  return{harness,close:async()=>{await closeSupport?.();await closeRealtime?.();server!.closeAllConnections();
   await new Promise<void>(resolve=>server!.close(()=>resolve()));await db.close();proxy.closeAllConnections();
   await new Promise<void>(resolve=>proxy.close(()=>resolve()));}};
 }catch(error){await closeSupport?.();await closeRealtime?.();server?.closeAllConnections();server?.close();await db.close();proxy.closeAllConnections();proxy.close();throw error;}
}

/** Parent process receives no cookies or keys from stdout. Cloud database,
 * payment and mail configuration is omitted. Genuine moderation tests may
 * explicitly pass only the authorized OpenAI key in the child environment. */
export async function runLocalSupabaseVerification(work:(h:LocalSupabaseHarness)=>Promise<unknown>,options:{staticFrontend?:boolean;moderation?:boolean;companion?:boolean;frontendDirectory?:string}={}){
 const worker=process.argv[2]===workerFlag,file=process.argv[worker?3:2];
 if(process.argv.length!==(worker?4:3))throw Error('Pass only a private local-stack metadata path.');
 const meta=readLocalSupabaseMetadata(file),credentials=prepareCredentials(meta);
 if(!worker){
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',NODE_EXTRA_CA_CERTS:credentials.cert,
   PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'UTC',TMPDIR:meta.root};
  if(options.moderation){if(!process.env.OPENAI_API_KEY)throw Error('The authorized moderation key is required.');env.OPENAI_API_KEY=process.env.OPENAI_API_KEY;}
  if(options.companion){if(!process.env.GROQ_API_KEY)throw Error('The authorized companion key is required.');env.GROQ_API_KEY=process.env.GROQ_API_KEY;}
  const child=spawn(process.execPath,['--import','tsx',path.resolve(process.argv[1]),workerFlag,file],
   {cwd:path.resolve('.'),env,stdio:['ignore','inherit','pipe']});
  const diagnostics:Buffer[]=[];let bytes=0;
  child.stderr.on('data',(part:Buffer)=>{bytes+=part.length;if(bytes<=1024*1024)diagnostics.push(part);});
  const interrupt=()=>child.kill('SIGINT'),terminate=()=>child.kill('SIGTERM');
  process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
  let code:number|null;
  try{code=await new Promise<number|null>((resolve,reject)=>{child.once('error',()=>reject(Error('Local-test child could not start.')));child.once('close',resolve);});}
  finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);}
  if(diagnostics.length){const filename=path.join(credentials.directory,'worker-'+crypto.randomUUID()+'.log');savePrivate(filename,Buffer.concat(diagnostics));}
  if(code!==0)throw Error('Local native Auth verification failed; diagnostics remain in the private run directory.');
  return;
 }
 const opened=await openHarness(meta,credentials,options);
 try{await work(opened.harness);}finally{await opened.close();}
}
