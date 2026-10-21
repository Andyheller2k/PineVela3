export type OrderHistoryPage<T>={orders:T[];nextCursor:string|null;hasMore:boolean;summary:{total:number;pending:number;completed:number;revenue:number};customers:any[]};
export function readOrderHistoryPage<T>(data:any):OrderHistoryPage<T>{
  if(!data||!Array.isArray(data.orders)||typeof data.hasMore!=='boolean'||(data.nextCursor!==null&&typeof data.nextCursor!=='string')||!data.summary||!Array.isArray(data.customers))throw Error('Could not read your order history. Please retry.');
  return data;
}
export function mergeOrderHistory<T extends {id:string;createdAt:string}>(previous:T[],incoming:T[]):T[]{
  const rows=new Map(previous.map(row=>[row.id,row]));for(const row of incoming)rows.set(row.id,row);
  return [...rows.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
}
