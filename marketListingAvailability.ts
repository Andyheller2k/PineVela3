/** Current service listings have no fabricated stock count. Legacy quantities
 * remain meaningful when present; an explicit saved kind wins over category text. */
export function isMarketService(listing:any):boolean {
  return typeof listing?.isService==='boolean' ? listing.isService : Boolean(listing?.serviceCategory || String(listing?.category || '').toLowerCase().includes('service'));
}
export function marketListingAvailable(listing:any):boolean {
  return Boolean(listing && listing.isAvailable!==false && (isMarketService(listing) && listing.stockQuantity==null || Number(listing.stockQuantity)>0));
}
