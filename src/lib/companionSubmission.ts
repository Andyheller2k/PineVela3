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
let active:{scope:string;submission:CompanionSubmission}|undefined;
export function clearCompanionSubmission(){active?.submission.clear();active=undefined;}
export function companionSubmission(scope:string){
  if(active?.scope!==scope)active={scope,submission:new CompanionSubmission()};
  return active.submission;
}
