export function reservationExpired(status:string,reservedUntil:string|Date,now=Date.now()){
  const deadline=new Date(reservedUntil).getTime();
  return ['awaiting_seller','pending_meetup'].includes(status)&&Number.isFinite(deadline)&&deadline<=now;
}
