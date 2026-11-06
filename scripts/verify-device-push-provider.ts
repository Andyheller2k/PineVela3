/** Live FCM authorization/payload validation only. validate_only never delivers. */
import dotenv from 'dotenv';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {JWT} from 'google-auth-library';
import {androidPushPayload,fcmCredentials,pushConfiguration} from '../supabase/devicePushProvider.js';
import {pushOpenPath} from '../devicePushPolicy.js';
dotenv.config({quiet:true});
const report:any={passed:false,validationOnly:true,notificationsSent:0,productionDatabaseWrites:0};
try{
  const config=pushConfiguration(),key=fcmCredentials();
  if(!config.web||!key)throw new Error('configuration');
  const auth=new JWT({email:key.client_email,key:key.private_key,scopes:['https://www.googleapis.com/auth/firebase.messaging'],transporterOptions:{timeout:10000,retry:false}});
  const {token}=await auth.getAccessToken();if(!token)throw new Error('authorization');
  const id=crypto.randomUUID(),context=crypto.randomUUID();
  const payload=androidPushPayload('validation-fixture-'.repeat(4),{title:'PineVela · User — Delivery validation',
    body:'Validation only. This message will not be sent.',tag:'pv:'+id+':'+context,path:pushOpenPath(id,context,'primary'),
    accountKind:'primary',notificationId:id,contextId:context,discovery:false});
  const {token:_discard,...message}=payload.message;
  const response=await fetch('https://fcm.googleapis.com/v1/projects/'+key.project_id+'/messages:send',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({validate_only:true,message:{...message,topic:'pinevela_delivery_validation'}}),
    signal:AbortSignal.timeout(10000),redirect:'error',
  });
  const data=await response.json().catch(()=>null);
  report.httpStatus=response.status;report.providerCode=String(data?.error?.status||'OK').slice(0,60);
  report.passed=response.ok;report.androidConfigured=config.android;report.webConfigured=config.web;
}catch{report.providerCode='VALIDATION_UNAVAILABLE';}
fs.mkdirSync('docs/verification/device-push-2026-11-05',{recursive:true});
fs.writeFileSync('docs/verification/device-push-2026-11-05/provider-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
