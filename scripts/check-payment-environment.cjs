/** Run from the existing hosting application root. Never prints secret values. */
const path=require('node:path');
require('dotenv').config({path:path.resolve('.env'),quiet:true});
const key=process.env.PAYSTACK_SECRET_KEY||'';
const valid=/^sk_(test|live)_[A-Za-z0-9]+$/.test(key);
const production=process.env.NODE_ENV==='production';
let originValid=false;
try{const u=new URL(process.env.PINEVELA_PUBLIC_ORIGIN||'');originValid=u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}catch{}
const report={secretPresent:!!key,secretFormatValid:valid,mode:valid?(key.startsWith('sk_live_')?'live':'test'):'unconfigured',production,publicOriginValid:originValid,productionCheckoutReady:valid&&key.startsWith('sk_live_')&&originValid};
async function main(){
  if(process.argv.includes('--check-provider')&&valid){
    // Read a non-financial integration setting. This cannot create a checkout,
    // charge, transfer, refund or alter any Paystack setting.
    try{
      const res=await fetch('https://api.paystack.co/integration/payment_session_timeout',{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
      const body=await res.json().catch(()=>null);report.providerAccepted=res.ok&&body?.status===true;report.providerHttpStatus=res.status;
    }catch{report.providerAccepted=false;report.providerNetworkUnavailable=true;}
  }
  console.log(JSON.stringify(report,null,2));
  if(!report.productionCheckoutReady||report.providerAccepted===false)process.exitCode=1;
}
void main();
