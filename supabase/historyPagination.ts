import {ApiError,uuid} from './db.js';

export type HistoryCursor={time:string;id:string};
export type HistoryPage={limit:number;before?:HistoryCursor;after?:HistoryCursor;paged:boolean};
export function encodeHistoryCursor(row:{cursor_time:string;id:string}){
  return Buffer.from(JSON.stringify([row.cursor_time,row.id])).toString('base64url');
}
function decode(value:unknown):HistoryCursor|undefined{
  if(value===undefined)return;
  if(typeof value!=='string'||value.length>200||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw new ApiError(400,'Invalid history cursor.');
  try{
    const data=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(!Array.isArray(data)||data.length!==2||typeof data[0]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(data[0])||!Number.isFinite(Date.parse(data[0])))throw Error();
    if(data[0].startsWith('0000-')||new Date(data[0]).toISOString()!==data[0].slice(0,23)+'Z')throw Error();
    return {time:data[0],id:uuid(data[1])};
  }catch{throw new ApiError(400,'Invalid history cursor.');}
}
export function historyPage(query:Record<string,unknown>,incremental=false):HistoryPage{
  if(Object.keys(query).some(k=>!['limit','before','paged',...(incremental?['after']:[])].includes(k))||query.before!==undefined&&query.after!==undefined)throw new ApiError(400,'Unsupported history filter.');
  if(query.limit!==undefined&&(typeof query.limit!=='string'||!/^\d{1,3}$/.test(query.limit)||Number(query.limit)<1||Number(query.limit)>100))throw new ApiError(400,'Use a history page size between 1 and 100.');
  if(query.paged!==undefined&&query.paged!=='1')throw new ApiError(400,'Invalid history format.');
  return {limit:query.limit===undefined?50:Number(query.limit),before:decode(query.before),after:decode(query.after),paged:query.paged==='1'};
}
// Preserve PostgreSQL microseconds. JavaScript Date truncation can skip rows at
// the boundary when messages share the same millisecond.
export const historyTimestamp=(alias:string)=>`to_char(${alias}.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time`;
