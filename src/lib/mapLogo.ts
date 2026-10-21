/** Current catalog media routes only; no arbitrary external image requests. */
export function mapLogoUrl(value:unknown,origin:string):string|undefined{
  if(typeof value!=='string'||!value||value.length>2048)return;
  try{
    const url=new URL(value,origin);
    if(url.origin!==origin||!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return;
    if(url.pathname!=='/store-covers/pinevela-logo.svg'&&!/^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname))return;
    return url.href;
  }catch{return;}
}
