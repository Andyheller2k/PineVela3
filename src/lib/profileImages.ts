import { sessionFetch } from './session';

/** Keep legacy sessions working during migration; the Supabase backend stores
 * an owned media reference, never inline pixels or an arbitrary external URL. */
export async function uploadProfileImage(value:string,contextId:string,settingsKey?:string) {
  if(import.meta.env.VITE_PERSISTENCE!=='supabase' || !value.startsWith('data:'))return value;
  const type=value.match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1];
  if(!type)throw new Error('Choose a JPEG, PNG or WebP profile picture.');
  const response=await sessionFetch('/api/storage/upload-profile-image',{method:'POST',
    headers:{'Content-Type':'application/json','X-PineVela-Profile-Context':contextId},
    body:JSON.stringify({fileData:value,fileType:type,...(settingsKey?{settingsKey}:{})})});
  const result=await response.json().catch(()=>null);
  if(!response.ok || typeof result?.imageUrl!=='string')throw new Error(result?.error || 'Your profile picture could not be uploaded.');
  return result.imageUrl;
}
