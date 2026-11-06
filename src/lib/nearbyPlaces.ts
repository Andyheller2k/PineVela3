import type {MarketProductItem} from '../components/MarketItemCard';
import {mappedService,servicePoint,type MapPoint} from '../../serviceLocation';
import type {PublicMapStore,StoreMapLocation} from '../../nearbyStores';

export type NearbyPlace={id:string;kind:'store'|'service';storeId:string;title:string;storeName:string;location:string;logoUrl?:string;point?:MapPoint;precision:StoreMapLocation['precision'];searchText:string;product?:MarketProductItem;store?:PublicMapStore};
export const storeLocationKey=(store:PublicMapStore)=>`${store.id}:${store.location}`;
export function nearbyPlaces(products:MarketProductItem[],stores:PublicMapStore[],locations:Record<string,StoreMapLocation>):NearbyPlace[]{
  const listingText=new Map<string,string[]>();
  for(const p of products)if(p.storeId){const text=listingText.get(p.storeId)||[];text.push([p.title,p.description,p.serviceCategory].join(' '));listingText.set(p.storeId,text);}
  return[
    ...stores.map(store=>{const location=locations[storeLocationKey(store)]||store.mapLocation;
      return{id:`store:${store.id}`,kind:'store' as const,storeId:store.id,title:store.storeName,storeName:store.storeName,location:store.location,logoUrl:store.logoUrl,
        point:location.point&&servicePoint(location.point.lat,location.point.lng)||undefined,precision:location.precision,store,
        searchText:[store.storeName,store.category,store.location,store.campus,...(listingText.get(store.id)||[])].join(' ').toLocaleLowerCase('en')};}),
    ...products.filter(mappedService).map(product=>({id:product.id,kind:'service' as const,storeId:product.storeId!,title:product.title,storeName:product.storeName,location:product.meetingLocation||'',logoUrl:product.storeLogoUrl,point:servicePoint(product.lat,product.lng)!,precision:'exact' as const,product,
      searchText:[product.title,product.storeName,product.serviceCategory,product.description,product.meetingLocation].join(' ').toLocaleLowerCase('en')}))
  ];
}
