import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mapLogoUrl} from '../src/lib/mapLogo.js';
const origin='http://127.0.0.1:3001',media='/api/media/922235dd-0655-4818-8af9-5a5bf94a120a';
test('map markers accept current same-origin catalog logos',()=>{
  for(const path of [media,'/store-covers/pinevela-logo.svg']){assert.equal(mapLogoUrl(path,origin),origin+path);assert.equal(mapLogoUrl(origin+path,origin),origin+path);}
});
test('map markers reject hostile origins, active URLs, ambiguous and retired paths',()=>{
  for(const value of [null,[],{},'','javascript:alert(1)','data:image/svg+xml,a','//elsewhere.invalid'+media,'http://127.0.0.1:3002'+media,'https://127.0.0.1:3001'+media,origin.replace('://','://user:password@')+media,media+'?x=1',media+'#x','/api/media/not-a-uuid','/api/media/922235dd-0655-4818-8af9-5a5bf94a120a/extra','/uploads/old.png','/assets/logo.svg','/store-covers/other.svg','https://remote.supabase.co/storage/v1/object/public/logo.png'])assert.equal(mapLogoUrl(value,origin),undefined);
});
