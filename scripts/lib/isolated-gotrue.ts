/** Actual pinned GoTrue binary against the disposable Unix-socket restore.
 * No Docker, browser permission prompt, mail, or hosted Auth writes. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import type {PoolConfig} from 'pg';

const binary=path.resolve('.security/local-workflow/supabase-home/cache/stack/slim-services/auth/v2.197.0-r0/linux-amd64/bd8f59ed1a817014afe71288c2275ad0396630f016f8cb5ab5129388860ec49b/bin/auth');
export async function withIsolatedGoTrue<T>(config:PoolConfig,work:(options:{origin:string;provider:string;serviceKey:string;publicKey:string})=>Promise<T>){
  if(typeof config.host!=='string'||!config.host.startsWith('/tmp/pv-orders-')||config.user!=='pv_restore'||config.database!=='postgres')throw Error('Only a disposable Unix-socket restore may run local Auth.');
  const reserve=http.createServer();await new Promise<void>(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const port=(reserve.address() as any).port;await new Promise<void>(resolve=>reserve.close(()=>resolve()));
  const root=fs.mkdtempSync('/tmp/pv-gotrue-');fs.chmodSync(root,0o700);
  const log=fs.openSync(path.join(root,'auth.log'),'wx',0o600),secret=crypto.randomBytes(48).toString('base64url');
  const token=(role:string)=>{const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({role,iss:'supabase',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return header+'.'+payload+'.'+crypto.createHmac('sha256',secret).update(header+'.'+payload).digest('base64url');};
  const origin=`http://127.0.0.1:${port}`,provider=`https://127.0.0.1:${port}`;
  const database=new URL('postgresql://pv_restore@localhost/postgres');database.searchParams.set('host',config.host);database.searchParams.set('port',String(config.port));database.searchParams.set('sslmode','disable');database.searchParams.set('search_path','auth');
  const child=spawn(binary,[],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),API_EXTERNAL_URL:origin,GOTRUE_API_HOST:'127.0.0.1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:database.href,GOTRUE_DB_NAMESPACE:'auth',GOTRUE_DB_MAX_POOL_SIZE:'3',GOTRUE_SITE_URL:origin,GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_PASSWORD_MIN_LENGTH:'8',GOTRUE_RATE_LIMIT_TOKEN_REFRESH:'1000',GOTRUE_RATE_LIMIT_VERIFY:'1000',GOTRUE_RATE_LIMIT_ANONYMOUS_USERS:'1000',GOTRUE_RATE_LIMIT_EMAIL_SENT:'1',GOTRUE_TRACING_ENABLED:'false',GOTRUE_METRICS_ENABLED:'false',LOG_LEVEL:'warn'},stdio:['ignore',log,log]});
  const realFetch=globalThis.fetch;
  try{
    const deadline=Date.now()+25000;let ready=false;
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw Error('Pinned local Auth exited; private diagnostics: '+path.join(root,'auth.log'));
      try{ready=(await realFetch(origin+'/health',{signal:AbortSignal.timeout(1000)})).ok;}catch{}
      if(ready)break;await new Promise(resolve=>setTimeout(resolve,150));
    }
    if(!ready)throw Error('Local Auth readiness timed out; private diagnostics: '+path.join(root,'auth.log'));
    // Test-only transport adapter: translate this one loopback HTTPS Auth prefix
    // into the native binary's HTTP listener. All provider responses are genuine.
    globalThis.fetch=((input:any,options?:RequestInit)=>{
      const url=new URL(input instanceof Request?input.url:String(input));
      if(url.origin===provider&&url.pathname.startsWith('/auth/v1/'))return realFetch(origin+url.pathname.slice('/auth/v1'.length)+url.search,options);
      if(url.hostname==='127.0.0.1'&&url.protocol==='http:')return realFetch(input,options);
      throw Error('Isolated Auth verification forbids every non-loopback request.');
    }) as typeof fetch;
    return await work({origin,provider,serviceKey:token('service_role'),publicKey:token('anon')});
  }finally{
    globalThis.fetch=realFetch;child.kill('SIGTERM');await Promise.race([once(child,'exit').catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null)child.kill('SIGKILL');fs.closeSync(log);
    // Failed diagnostics remain private; successful callers may inspect neither
    // credentials nor native tokens in public reports.
  }
}
