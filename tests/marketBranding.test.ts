import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MARKET_DEFAULT_COVERS,MARKET_DEFAULT_LOGO,marketStoreBranding,isDefaultMarketCover} from '../marketBranding.js';
test('native branding hides custom images when the supporting plan expires or is inactive',()=>{
 const profile='/api/media/own-profile',cover='/api/media/own-cover';
 const store={subscriptionPlan:'pro',subscriptionStatus:'active',subscriptionExpiresAt:'2099-01-01T00:00:00Z',profilePicture:profile,coverPicture:cover};
 for(const current of [{...store,subscriptionPlan:'default'},{...store,subscriptionExpiresAt:'2000-01-01T00:00:00Z'},{...store,subscriptionStatus:'inactive'}]){
  const branding=marketStoreBranding(current,true);assert.equal(branding.customBranding,false);
  assert.equal(branding.profilePicture,MARKET_DEFAULT_LOGO);assert.equal(branding.coverPicture,MARKET_DEFAULT_COVERS[0].url);
  assert.equal(current.profilePicture,profile,'Hidden images remain saved for a future eligible plan');
 }
 for(const plan of ['star','pro']){
  const branding=marketStoreBranding({...store,subscriptionPlan:plan},true);
  assert.equal(branding.customBranding,true);assert.equal(branding.profilePicture,profile);assert.equal(branding.coverPicture,cover);
 }
 assert.equal(marketStoreBranding({...store,subscriptionStatus:'test_active'},true).customBranding,false);
 for(const value of MARKET_DEFAULT_COVERS){assert.equal(isDefaultMarketCover(value.url),true);assert.equal(marketStoreBranding({coverPicture:value.url}).coverPicture,value.url);}
 assert.equal(isDefaultMarketCover(cover),false);assert.equal(MARKET_DEFAULT_COVERS.length,4);
});
