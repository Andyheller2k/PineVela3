import {servicePoint,type MapPoint} from './serviceLocation.js';

export type StoreMapLocation={point:MapPoint|null;precision:'exact'|'approximate'|'unavailable';label:string};
export type PublicMapStore={id:string;storeName:string;location:string;category:string;campus:string;logoUrl:string;mapLocation:StoreMapLocation};

/** StoreLocationInput saves the owner's selected pin at the end of the address. */
export function savedStorePoint(location:unknown):MapPoint|undefined{
  if(typeof location!=='string')return;
  const match=location.match(/\((-?\d{1,2}(?:\.\d{1,8})?),\s*(-?\d{1,3}(?:\.\d{1,8})?)\)\s*$/);
  return match?servicePoint(match[1],match[2]):undefined;
}
export function storeMapLocation(location:string):StoreMapLocation{
  const point=savedStorePoint(location);
  return{point:point||null,precision:point?'exact':'unavailable',label:location};
}
