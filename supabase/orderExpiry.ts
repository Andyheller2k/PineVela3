import type {SupabaseDatabase} from './db.js';
import {notify} from './notifications.js';

/** Bounded, server-owned recovery. Locks match handover: store → listing → order.
 * A competing renewal/completion wins atomically or is rejected as expired. */
export async function expireOrderReservations(db:SupabaseDatabase){
  const candidates=await db.system(async c=>(await c.query(`select id,store_id,listing_id from public.market_orders
    where status in ('awaiting_seller','pending_meetup') and reserved_until<=clock_timestamp() order by reserved_until,id limit 50`)).rows);
  let expired=0;
  for(const candidate of candidates){
    const changed=await db.system(async c=>{
      const store=(await c.query('select id,seller_context_id from public.stores where id=$1 for update skip locked',[candidate.store_id])).rows[0];if(!store)return false;
      await c.query('select id from public.listings where id=$1 for update',[candidate.listing_id]);
      const order=(await c.query("select * from public.market_orders where id=$1 and status in ('awaiting_seller','pending_meetup') and reserved_until<=clock_timestamp() for update",[candidate.id])).rows[0];if(!order)return false;
      await c.query("update public.market_orders set status='expired' where id=$1",[order.id]);
      await c.query('delete from private.market_order_pins where order_id=$1',[order.id]);
      await c.query("insert into private.market_order_events(order_id,actor_context_id,action,status,notes) values($1,null,'expired','expired','The 24-hour reservation ended without a completed handover.')",[order.id]);
      await c.query("insert into private.audit_events(event_type,resource_type,resource_id) values('market_order_expired','market_order',$1)",[order.id]);
      await notify(c,[order.buyer_context_id,store.seller_context_id],{category:'market',title:'Reservation Expired',orderId:order.id,message:`${order.snapshot.productTitle}: the reservation ended. No payment was charged by PineVela. A new request checks current stock and availability.`});
      return true;
    });
    if(changed)expired++;
  }
  return expired;
}
export function startOrderExpiry(db:SupabaseDatabase){
  let stopped=false,running:Promise<void>|undefined;
  const tick=()=>{if(stopped||running)return;running=expireOrderReservations(db).then(()=>undefined).catch(()=>{console.warn('Order reservation recovery will retry.');}).finally(()=>{running=undefined;});};
  const timer=setInterval(tick,60000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await running;};
}
