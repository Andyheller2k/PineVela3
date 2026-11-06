import {ApiError,type SupabaseDatabase} from './db.js';
import {checkPortalPin} from './portalAccess.js';
import {verifyCredentialAsync} from '../accountSecurity.js';
import {unwrapResidentPassword} from './residentPinCrypto.js';

/** Resolve only a managed, active room identity. A probe rolls back failed PIN
 * counters so a valid legacy numeric email password can still be authenticated.
 * Its denial is recorded separately if the single provider exchange fails. */
async function proof(db:SupabaseDatabase,email:string,pin:string,recordFailure:boolean){
  return db.system(async c=>{
    const record=(await c.query(`select e.id,e.primary_owner_id,e.invited_email,x.id as context_id,x.auth_user_id
      from public.profiles owner join public.account_contexts primary_account on primary_account.auth_user_id=owner.id
      join private.resident_pin_credentials k on k.primary_owner_id=owner.id
      join private.account_enrollments e on e.id=k.enrollment_id and e.primary_owner_id=owner.id
      join public.account_contexts x on x.id=e.linked_context_id and x.auth_user_id=e.auth_user_id
      join private.portal_access_keys access_key on access_key.context_id=x.id
      join public.profiles child on child.id=x.auth_user_id and child.primary_owner_id=owner.id
      join auth.users u on u.id=child.id
      where lower(owner.email)=$1 and owner.primary_owner_id is null and primary_account.kind='primary' and primary_account.status='active'
        and x.kind='resident' and x.status='active' and x.primary_owner_id=owner.id and x.auth_user_id<>owner.id
        and e.status='completed' and e.kind='resident' and e.enrollment_fields->>'authentication'='resident_pin'
        and lower(u.email)=e.invited_email and u.email_confirmed_at is not null
        and exists(select 1 from public.allocations a where a.resident_context_id=x.id and a.ended_at is null)
        and not exists(select 1 from public.account_contexts other where other.auth_user_id=x.auth_user_id and other.id<>x.id)
      for share of owner,primary_account,x`,[email])).rows[0];
    if(!record){await verifyCredentialAsync(pin,`scrypt-sha256$${'0'.repeat(32)}$${'0'.repeat(64)}`);return null;}
    if(!recordFailure)await c.query('savepoint resident_pin_probe');
    if(!(await checkPortalPin(c,record.context_id,pin)).allowed){
      if(!recordFailure)await c.query('rollback to savepoint resident_pin_probe');
      return null;
    }
    const credential=(await c.query('select wrapped_password from private.resident_pin_credentials where enrollment_id=$1 for share',[record.id])).rows[0];
    const password=await unwrapResidentPassword(credential.wrapped_password,pin,record.id,record.primary_owner_id);
    return{email:record.invited_email,password,contextId:record.context_id,authUserId:record.auth_user_id};
  });
}
export const probeResidentPinLogin=(db:SupabaseDatabase,email:string,pin:string)=>proof(db,email,pin,false);
export async function residentPinLoginProof(db:SupabaseDatabase,email:string,pin:string){
  const result=await proof(db,email,pin,true);
  if(!result)throw new ApiError(401,'Invalid email or room PIN.','invalid_credentials');
  return result;
}
