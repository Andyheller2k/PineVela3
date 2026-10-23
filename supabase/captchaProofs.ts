import {createHash} from 'node:crypto';
import {ApiError,type SupabaseDatabase} from './db.js';

export const CAPTCHA_PROOF_MAX_LENGTH=2048;
export const CAPTCHA_PROOF_CAPACITY=50000;
export const captchaReplayError=()=>new ApiError(422,'Security verification expired or was already used. Please complete it again.','captcha_failed');

export function captchaProof(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.length>CAPTCHA_PROOF_MAX_LENGTH)
  throw new ApiError(400,'Complete security verification again.','captcha_required');
 return value.trim();
}

/** Commit admission BEFORE any workflow/provider transaction. The token is
 * still validated only by Supabase; this shared hash ledger independently
 * rejects reuse, including failed/ambiguous attempts and concurrent app servers.
 * Ten minutes exceeds Turnstile's native five-minute validity. */
export async function claimCaptchaProof(db:SupabaseDatabase,value:unknown):Promise<void> {
 const proofHash=createHash('sha256').update(captchaProof(value)).digest('hex');
 let result:'claimed'|'duplicate'|'capacity';
 try{result=await db.system(async client=>{
  // This lock protects only a short, local database admission; no upstream
  // request, password verification, or workflow lock runs while it is held.
  await client.query("set local lock_timeout='2s';select pg_advisory_xact_lock(hashtextextended('pinevela-captcha-proof-capacity',0))");
  await client.query(`delete from private.auth_captcha_proofs where proof_hash in (
   select proof_hash from private.auth_captcha_proofs where expires_at<=clock_timestamp()
   order by expires_at limit 100 for update skip locked)`);
  const {rows:[state]}=await client.query<{duplicate:boolean;total:string}>(`select
   exists(select 1 from private.auth_captcha_proofs where proof_hash=$1) as duplicate,
   (select count(*)::text from private.auth_captcha_proofs) as total`,[proofHash]);
  if(state.duplicate)return 'duplicate' as const;
  if(Number(state.total)>=CAPTCHA_PROOF_CAPACITY)return 'capacity' as const;
  const inserted=await client.query(`insert into private.auth_captcha_proofs(proof_hash)
   values($1) on conflict(proof_hash) do nothing returning proof_hash`,[proofHash]);
  return inserted.rowCount?'claimed' as const:'duplicate' as const;
 });}catch(error){
  if((error as {code?:string})?.code==='55P03')throw new ApiError(503,'Security verification is temporarily busy. Please try again shortly.','captcha_unavailable');
  throw error;
 }
 // Rejections occur after COMMIT, so bounded expiry cleanup also persists at
 // capacity. Never release a claim after a provider error or lost response.
 if(result==='duplicate')throw captchaReplayError();
 if(result==='capacity')throw new ApiError(503,'Security verification is temporarily busy. Please try again shortly.','captcha_unavailable');
}
