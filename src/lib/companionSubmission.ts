/** One logical send survives an interrupted response and component remounts.
 * Memory only, scoped to the current account AND authentication generation. */
export class CompanionSubmission {
  unresolved?:{id:string;text:string};
  begin(text:string){
    const value=text.trim();
    if(this.unresolved&&this.unresolved.text!==value)throw Error('Check your saved replies or retry your last message before sending a different question.');
    return this.unresolved??(this.unresolved={id:crypto.randomUUID(),text:value});
  }
  receipt(id:string,text:string){
    if(!this.unresolved||this.unresolved.id!==id||this.unresolved.text!==text)return false;
    this.unresolved=undefined;return true;
  }
  clear(){this.unresolved=undefined;}
}
export type ConfirmedCompanionProviderRejection={status:503;code:'companion_provider_403'};
/** Only this server response proves the provider rejected the turn before an
 * app reply could be committed. Transport failures remain ambiguous. */
export function confirmedCompanionProviderRejection(status:number,response:unknown):ConfirmedCompanionProviderRejection|undefined{
  if(status!==503||!response||typeof response!=='object'||Array.isArray(response))return;
  const value=response as Record<string,unknown>;
  if(value.code!=='companion_provider_403'||typeof value.error!=='string'||!value.error.trim()||value.error.length>500)return;
  return{status:503,code:'companion_provider_403'};
}
let active:{scope:string;submission:CompanionSubmission}|undefined;
export function clearCompanionSubmission(){active?.submission.clear();active=undefined;}
export function companionSubmission(scope:string){
  if(active?.scope!==scope)active={scope,submission:new CompanionSubmission()};
  return active.submission;
}
/** Late errors cannot release a newer send or a different account/session. */
export function releaseRejectedCompanionSubmission(scope:string,submission:CompanionSubmission,id:string,text:string,rejection:ConfirmedCompanionProviderRejection){
  if(active?.scope!==scope||active.submission!==submission||rejection.status!==503||rejection.code!=='companion_provider_403')return false;
  return submission.receipt(id,text);
}
