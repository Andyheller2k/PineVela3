
type Fetch = (url:string,options?:RequestInit)=>Promise<any>;
/** Upload the actual captured image once. Stable private references survive retry. */
export async function uploadMaintenancePhoto(apiFetch:Fetch,photo:string,issueId?:string):Promise<string> {
  if ((photo.startsWith('/api/media/'))) return photo;
  const mime = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(photo)?.[1];
  if (!mime) throw new Error('Choose a PNG, JPEG or WebP photograph.');
  const result = await apiFetch(issueId ? '/api/storage/upload-repair-image' : '/api/storage/upload-maintenance-image',{
    method:'POST',body:JSON.stringify({fileData:photo,fileType:mime,...(issueId ? {issueId} : {})})
  });
  if (typeof result?.imageUrl !== 'string' || !result.imageUrl.startsWith('/api/media/')) throw new Error('The photograph could not be saved.');
  return result.imageUrl;
}
