import type {PoolClient} from 'pg';

/** Read-only classification from server-owned Auth records. Email verification,
 * local provider labels and client metadata alone never qualify an account. */
export async function googleRetentionInventory(client:PoolClient) {
  const rows=(await client.query(`select u.id,lower(u.email) as email,
    (u.is_anonymous is false and u.email_confirmed_at is not null and exists(
      select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
        and i.identity_data->'email_verified'='true'::jsonb
        and lower(i.identity_data->>'email')=lower(u.email))) as retain
    from auth.users u order by u.id`)).rows as {id:string;email:string|null;retain:boolean}[];
  return {policy:'verified_google_only' as const,retained:rows.filter(r=>r.retain),removalCandidates:rows.filter(r=>!r.retain)};
}

/** A saved Auth UUID AND matching verified Google mailbox are both required.
 * Shared/missing local bindings need review rather than email-based adoption. */
export function classifyLocalAccounts<T extends {id:string;email:string;supabaseUserId:string}>(accounts:T[],retained:{id:string;email:string|null}[]) {
  const trusted=new Map(retained.map(r=>[r.id,r.email]));
  const keep=accounts.filter(a=>a.supabaseUserId && trusted.get(a.supabaseUserId)===a.email.trim().toLowerCase());
  const ids=new Set(keep.map(a=>a.id));
  return {retained:keep,removalCandidates:accounts.filter(a=>!ids.has(a.id)),
    ambiguousBindings:keep.filter(a=>keep.filter(b=>b.supabaseUserId===a.supabaseUserId).length>1)};
}
