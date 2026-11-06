/** Public, credential-free notification routing/labels shared by app and server. */
export const PUSH_ACCOUNT_LABELS: Record<string,string> = {
  primary:'User',resident:'Resident',manager:'Manager',staff:'Staff',seller:'Seller',
  admin:'Administrator',officer:'Verification',feedback:'Feedback & support',
};
export const PUSH_ROLE_KINDS: Record<string,string> = {
  user:'primary',student:'resident',manager:'manager',staff:'staff',merchant:'seller',
  admin:'admin',field_officer:'officer',officer:'officer',verification_team:'officer',
};
export const PUSH_DASHBOARDS: Record<string,string> = {
  primary:'/user/dashboard',resident:'/resident/dashboard',manager:'/manager/dashboard',
  staff:'/staff/dashboard',seller:'/digital-market',admin:'/admin/dashboard',
  officer:'/field-officer',feedback:'/customer-service',
};
export const PUSH_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function pushOpenPath(notificationId:string,contextId:string,kind:string) {
  if(!PUSH_UUID.test(notificationId)||!PUSH_UUID.test(contextId)||!Object.hasOwn(PUSH_ACCOUNT_LABELS,kind))throw new Error('Invalid notification destination.');
  return '/device-notification?notice='+notificationId+'&account='+contextId+'&kind='+kind;
}
export function pushTitle(kind:string,title:string) {
  const label=PUSH_ACCOUNT_LABELS[kind]||'Account';
  return `PineVela · ${label} — ${title.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120)}`;
}
export function privatePushBody(kind:string,category:string) {
  const label=PUSH_ACCOUNT_LABELS[kind]||'account';
  if(category.startsWith('maintenance')||['issue_report','repair_review'].includes(category))return `A maintenance update is ready in your ${label} account. Open PineVela to view it.`;
  if(category==='market_message')return `You have a new encrypted marketplace message. Open your ${label} account to read it.`;
  return `A new alert is ready in your ${label} account. Open PineVela to read it.`;
}
export function safePushPath(value:unknown) {
  if(typeof value!=='string'||value.length>500||!value.startsWith('/device-notification?'))return null;
  try{
    const u=new URL(value,'https://pinevela.app');
    const id=u.searchParams.get('notice')||'',context=u.searchParams.get('account')||'',kind=u.searchParams.get('kind')||'';
    if(u.origin!=='https://pinevela.app'||u.pathname!=='/device-notification'||u.hash||u.searchParams.size!==3
      ||[...u.searchParams.keys()].some(k=>!['notice','account','kind'].includes(k)||u.searchParams.getAll(k).length!==1))return null;
    return pushOpenPath(id,context,kind);
  }catch{return null;}
}
