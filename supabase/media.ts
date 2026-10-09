import crypto from 'node:crypto';
import express,{type Express,type RequestHandler} from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { decodeImageUpload } from '../imageUploadSecurity.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { maintenanceResidence,residentRoom } from './maintenance.js';
import { SupabaseStorage,MAX_MEDIA_BYTES } from './storage.js';
export type Purpose = 'hostel'|'market'|'inspection'|'maintenance'|'repair';
type HousingScope = {residenceId?:string;allocationId?:string;issueId?:string};
const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => {work(req as AuthRequest,res).catch(next);};
export const mediaUrl = (id:string) => `/api/media/${id}`;
export async function canUploadMedia(client:PoolClient,actor:VerifiedActor,purpose:Purpose,inspectionId?:string,housing:HousingScope = {}) {
  if (purpose === 'hostel') {
    if (!['manager','admin'].includes(actor.kind)) throw new ApiError(403,'Manager or administrator access required.');
    if (actor.kind === 'manager') {
      const banned = await client.query(`select 1 from public.registration_bans b join public.account_contexts c on c.id = b.account_context_id
        join public.account_contexts own on own.id = $1 where (c.id = own.id or c.auth_user_id = own.primary_owner_id
        or c.primary_owner_id = own.primary_owner_id) and b.kind in ('manager_account','residence') and b.until_at > clock_timestamp()`,[actor.contextId]);
      if (banned.rowCount) throw new ApiError(403,'Residence registration is temporarily restricted.');
    }
  } else if (purpose === 'market') {
    if (!['seller','admin'].includes(actor.kind)) throw new ApiError(403,'Seller or administrator access required.');
    if (actor.kind === 'seller') {
      const store = await client.query(`select s.id from public.stores s where s.seller_context_id = $1 and s.status in ('pending','active')
        and exists(select 1 from public.seller_applications a where a.seller_context_id = $1 and a.status = 'approved') for share of s`,[actor.contextId]);
      if (!store.rowCount) throw new ApiError(403,'An approved seller store is required to upload marketplace photographs.');
    }
  } else if (purpose === 'inspection') {
    if (actor.kind !== 'officer' || !inspectionId) throw new ApiError(403,'Assigned verification officer access required.');
    const inspection = await client.query(`select i.id from public.verification_inspections i join public.verification_cases v on v.id = i.case_id
      where i.id = $1 and i.officer_context_id = $2 and i.status in ('assigned','in_progress')
      and v.status in ('inspection_pending','under_review','more_info_required') for share of i,v`,[inspectionId,actor.contextId]);
    if (!inspection.rowCount) throw new ApiError(404,'An open assigned inspection is required.');
  } else if (purpose === 'maintenance') {
    if (!['resident','manager','admin'].includes(actor.kind)) throw new ApiError(403,'Housing reporter access required.');
    const room = actor.kind === 'resident' ? await residentRoom(client,actor) : null;
    const residenceId = room?.residence_id || housing.residenceId;
    if (room && housing.residenceId && housing.residenceId !== room.residence_id) throw new ApiError(403,'Photograph belongs to another residence.');
    if (!residenceId) throw new ApiError(400,'Choose an authorized residence for this photograph.');
    await maintenanceResidence(client,actor,residenceId);
    if (room) {
      const current = await residentRoom(client,actor,true);
      if (current.allocation_id !== room.allocation_id || housing.allocationId && housing.allocationId !== current.allocation_id)
        throw new ApiError(403,'Photograph belongs to a different room allocation.');
    }
    return {residenceId,allocationId:room?.allocation_id};
  } else {
    if (actor.kind !== 'staff' || !housing.issueId) throw new ApiError(403,'Assigned staff access required.');
    const initial = (await client.query('select residence_id from public.maintenance_issues where id = $1',[housing.issueId])).rows[0];
    if (!initial) throw new ApiError(404,'Assigned repair not found.');
    await maintenanceResidence(client,actor,initial.residence_id);
    const issue = await client.query(`select i.id from public.maintenance_issues i join public.staff_assignments s on s.id = i.assigned_staff_id
      where i.id = $1 and s.staff_context_id = $2 and s.status = 'active' and s.ended_at is null
      and i.status in ('accepted','follow_up') and i.accepted_at is not null and i.declined_at is null for share of i,s`,[housing.issueId,actor.contextId]);
    if (!issue.rowCount) throw new ApiError(403,'Accept your active assigned repair before uploading completion evidence.');
    return {residenceId:initial.residence_id,issueId:housing.issueId};
  }
}
/** Caller holds a verified actor transaction. The reservation remains durable
 * until upload succeeds or cleanup reconciles a failed/interrupted transfer. */
export async function reserveMedia(client:PoolClient,actor:VerifiedActor,purpose:Purpose,bytes:Buffer,inspectionId?:string,housing:HousingScope = {}) {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new ApiError(413,'The processed photograph must be at most 6MB.');
  const scope = await canUploadMedia(client,actor,purpose,inspectionId,housing);
  await client.query("select pg_advisory_xact_lock(hashtextextended('media:global',0))");
  const global = (await client.query("select coalesce(sum(byte_size),0) as bytes from public.media_assets where created_at > clock_timestamp() - interval '24 hours'")).rows[0];
  if (Number(global.bytes) + bytes.length > 2 * 1024 * 1024 * 1024) throw new ApiError(429,'The daily platform photograph allowance is used. Try again later.');
  // Serialize per-account quota checks across processes. No local JSON counters.
  await client.query("select pg_advisory_xact_lock(hashtextextended('media:' || $1::text,0))",[actor.contextId]);
  const used = (await client.query(`select count(*) as count,coalesce(sum(byte_size),0) as bytes from public.media_assets
    where owner_context_id = $1 and created_at > clock_timestamp() - interval '24 hours'`,[actor.contextId])).rows[0];
  if (Number(used.count) >= 100 || Number(used.bytes) + bytes.length > 250 * 1024 * 1024) throw new ApiError(429,'Your daily photograph upload allowance is used. Try again later.');
  const id = crypto.randomUUID(),objectPath = `contexts/${actor.contextId}/${id}.png`;
  return (await client.query(`insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,inspection_id,object_path,byte_size,sha256,residence_id,allocation_id,issue_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[id,actor.contextId,actor.authUserId,purpose,inspectionId || null,objectPath,bytes.length,crypto.createHash('sha256').update(bytes).digest('hex'),scope?.residenceId || null,scope?.allocationId || null,scope?.issueId || null])).rows[0];
}
export async function finishMedia(client:PoolClient,actor:VerifiedActor,id:string) {
  const initial = (await client.query("select * from public.media_assets where id = $1 and owner_context_id = $2 and owner_auth_user_id = $3 and state = 'reserved'",[id,actor.contextId,actor.authUserId])).rows[0];
  if (!initial) throw new ApiError(409,'Photograph upload reservation has ended.');
  // Lock housing scope before asset metadata, matching ticket attachment writes.
  await canUploadMedia(client,actor,initial.purpose,initial.inspection_id || undefined,{residenceId:initial.residence_id,allocationId:initial.allocation_id,issueId:initial.issue_id});
  const asset = (await client.query("select * from public.media_assets where id = $1 and state = 'reserved' for update",[id])).rows[0];
  if (!asset) throw new ApiError(409,'Photograph upload reservation has ended.');
  await client.query("update public.media_assets set state = 'ready' where id = $1",[id]);
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values ($1,'photograph_uploaded','media_asset',$2)`,[actor.contextId,id]);
  return {success:true,imageUrl:mediaUrl(id),imagePath:mediaUrl(id),assetId:id,storageType:'supabase-private'};
}
export async function ownedMedia(client:PoolClient,actor:VerifiedActor,url:unknown,purpose:Purpose,inspectionId?:string) {
  if (typeof url !== 'string' || !/^\/api\/media\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(url)) throw new ApiError(400,'Use a photograph uploaded to this account.');
  const asset = (await client.query(`select * from public.media_assets where id = $1 and owner_context_id = $2 and owner_auth_user_id = $3
    and state = 'ready' and purpose = $4 and inspection_id is not distinct from $5::uuid for share`,[url.slice('/api/media/'.length),actor.contextId,actor.authUserId,purpose,inspectionId || null])).rows[0];
  if (!asset) throw new ApiError(403,'This photograph does not belong to the authorized account and submission.');
  return asset;
}
/** Install before the ordinary small JSON parser: authorization and bounded
 * admission happen before reading a potentially large image request. */
export function installMedia(app:Express,auth:SupabaseAuth) {
  const storage = new SupabaseStorage(),budgets = new AttemptBudgets();let uploads = 0;
  const admission:RequestHandler = (req,res,next) => {
    if (uploads >= 2) return next(new ApiError(503,'Photograph processing is busy. Try again shortly.'));
    try {budgets.reserve([{scope:'photo-ip',identity:req.ip || req.socket.remoteAddress || '',maximum:200,windowMs:86400000}]);} catch (error) {return next(error);}
    uploads++;
    (req as any).releaseUpload = () => {if ((req as any).releaseUpload) {uploads--;delete (req as any).releaseUpload;}};
    res.once('close',() => {if (!(req as any).processingUpload) (req as any).releaseUpload?.();});
    const timeout = setTimeout(() => res.destroy(),45000);timeout.unref();
    res.once('finish',() => clearTimeout(timeout));res.once('close',() => clearTimeout(timeout));
    next();
  };
  const parse = express.json({limit:'28mb',inflate:false});
  const upload = (purpose:Purpose) => route(async (req,res) => {
    (req as any).processingUpload = true;
    try {
      const inspectionId = purpose === 'inspection' ? uuid(req.body?.inspectionId) : undefined;
      const housing = {residenceId:req.body?.hostelId === undefined ? undefined : uuid(req.body.hostelId),issueId:purpose === 'repair' ? uuid(req.body?.issueId) : undefined};
      await auth.db.authorizedSystem(req.actor,[req.actor.kind],client => canUploadMedia(client,req.actor,purpose,inspectionId,housing));
      const bytes = await decodeImageUpload(req.body,2048);
      const asset = await auth.db.authorizedSystem(req.actor,[req.actor.kind],client => reserveMedia(client,req.actor,purpose,bytes,inspectionId,housing));
      try {
        await storage.upload(asset.object_path,bytes);
        const result = await auth.db.authorizedSystem(req.actor,[req.actor.kind],client => finishMedia(client,req.actor,asset.id));
        return res.status(201).json(result);
      } catch (error) {
        // Supabase cannot atomically commit object bytes and PostgreSQL rows.
        // Delete through Storage even when a response was lost after upload.
        // A commit response can be lost after readiness was committed. Preserve
        // ready objects; reconcile only a durably failed reservation.
        const failed = await auth.db.system(async client => Boolean((await client.query("update public.media_assets set state = 'failed' where id = $1 and state = 'reserved' returning id",[asset.id])).rowCount)).catch(() => false);
        if (failed) {
          let removed = false;try {await storage.remove(asset.object_path);removed = true;} catch {}
          if (removed) await auth.db.system(async client => {await client.query("delete from public.media_assets where id = $1 and state = 'failed'",[asset.id]);}).catch(() => undefined);
        }
        throw error;
      }
    } finally {(req as any).releaseUpload?.();}
  });
  app.post('/api/storage/upload-hostel-image',auth.require(['manager','admin']),admission,parse,upload('hostel'));
  app.post('/api/storage/upload-market-image',auth.require(['seller','admin']),admission,parse,upload('market'));
  app.post('/api/storage/upload-inspection-image',auth.require(['officer']),admission,parse,upload('inspection'));
  app.post('/api/storage/upload-maintenance-image',auth.require(['resident','manager','admin']),admission,parse,upload('maintenance'));
  app.post('/api/storage/upload-repair-image',auth.require(['staff']),admission,parse,upload('repair'));
  // Errors before the handler (parser rejection/disconnect) release admission.
  app.use((error:any,req:any,_res:any,next:any) => {req.releaseUpload?.();next(error);});
  app.get('/api/media/:id',route(async (req,res) => {
    const id = uuid(req.params.id);
    let asset = await auth.db.system(async client => (await client.query(`select * from public.media_assets
      where id = $1 and private.media_asset_is_public(id)`,[id])).rows[0]);
    if (!asset) {
      // Do not reveal whether an unauthenticated private identifier exists.
      let actor:VerifiedActor;try {actor = (await auth.authenticate(req,res)).actor;} catch (error) {
        if (error instanceof ApiError && error.status === 401) throw new ApiError(404,'Photograph not found.');throw error;
      }
      asset = await auth.db.actor(actor,async client => (await client.query("select * from public.media_assets where id = $1 and state = 'ready'",[id])).rows[0]);
    }
    if (!asset) throw new ApiError(404,'Photograph not found.');
    const bytes = await storage.download(asset.object_path,asset);
    res.set({'Content-Type':'image/png','Content-Disposition':'inline; filename="photograph.png"',
      'Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});
    return res.send(bytes);
  }));
}
