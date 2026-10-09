import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARKET_DEFAULT_COVERS, MARKET_DEFAULT_LOGO, marketStoreBranding } from '../marketBranding.js';
import { storeProfileFields, StoreProfileError, publicStoreProfile } from '../marketStoreProfile.js';
import { publicPaidStore } from '../paystackPayments.js';

test('Default, expired and production test subscriptions cannot supply custom branding; paid ownership and preserved photos still apply', () => {
  const actor = { id: 'owned-merchant' }, url = '/uploads/owned-photo.png', foreign = '/uploads/foreign-photo.png';
  const database = { marketMedia: [{ accountId: actor.id, imageUrl: url }, { accountId: 'other', imageUrl: foreign }] };
  const seller = { id:'registered-store', storeName:'Registered store', subscriptionPlan:'pro', subscriptionStatus:'active', subscriptionExpiresAt:'2099-01-01T00:00:00.000Z', profilePicture:url, coverPicture:url };
  for (const current of [{ ...seller, subscriptionPlan:'default' }, { ...seller, subscriptionExpiresAt:'2000-01-01T00:00:00.000Z' }, { ...seller, subscriptionStatus:'inactive' }]) {
    assert.equal(marketStoreBranding(current).customBranding,false);
    for (const key of ['profilePicture','coverPicture']) assert.throws(() => storeProfileFields({ [key]:url,subscriptionPlan:'pro' },actor,database,current), (e: any) => e instanceof StoreProfileError && e.status === 403);
    for (const cover of MARKET_DEFAULT_COVERS) assert.equal(storeProfileFields({ coverPicture:cover.url },actor,database,current).coverPicture,cover.url);
    const profile = publicStoreProfile(current,database);assert.equal(profile.profilePicture,MARKET_DEFAULT_LOGO);assert.equal(profile.logoUrl,MARKET_DEFAULT_LOGO);assert.equal(profile.coverPicture,MARKET_DEFAULT_COVERS[0].url);
    assert.equal(current.profilePicture,url,'Downgrading hides stored custom photos without deleting them');
    assert.equal(publicPaidStore(current).bannerUrl,MARKET_DEFAULT_COVERS[0].url);
  }
  for(const plan of ['star','pro']) { const current = {...seller,subscriptionPlan:plan};assert.equal(storeProfileFields({coverPicture:url,profilePicture:url},actor,database,current).coverPicture,url);assert.throws(()=>storeProfileFields({coverPicture:foreign},actor,database,{...current,coverPicture:''}),StoreProfileError); }
  assert.equal(marketStoreBranding({...seller,subscriptionStatus:'test_active'},true).customBranding,false);
  assert.equal(MARKET_DEFAULT_COVERS.length,4);
});
