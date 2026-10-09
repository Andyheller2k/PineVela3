import assert from 'node:assert/strict';
import { test } from 'node:test';
import { servicePoint, mappedService, distanceKm, serviceDirections } from '../serviceLocation.js';
test('Service coordinates reject untrusted values and preserve the equator and prime meridian',()=>{
  assert.deepEqual(servicePoint(0,0),{lat:0,lng:0}); assert.deepEqual(servicePoint('-90','180'),{lat:-90,lng:180});
  for(const value of [null,undefined,true,false,'',[],{},NaN,Infinity,'1e10','0;alert(1)']) assert.equal(servicePoint(value,0),undefined);
  assert.equal(servicePoint(90.01,0),undefined); assert.equal(servicePoint(0,-180.01),undefined);
});
test('Discovery only includes live Fixed and Hybrid services with valid persistent pins',()=>{
  const p={id:'contract',storeId:'store',isService:true,stockQuantity:1,isAvailable:true,serviceLocationMode:'fixed',lat:0,lng:0};
  assert(mappedService(p));assert(mappedService({...p,serviceLocationMode:'hybrid'}));
  assert(mappedService({...p,stockQuantity:null}));
  for(const patch of [{serviceLocationMode:'flexible'},{isAvailable:false},{stockQuantity:0},{lat:null},{lng:181},{storeId:''},{isService:false}]) assert(!mappedService({...p,...patch}));
  assert.equal(distanceKm({lat:0,lng:0},{lat:0,lng:0}),0); assert(Math.abs(distanceKm({lat:0,lng:0},{lat:0,lng:1})-111.195)<.01);
});
test('Directions use a fixed HTTPS Google origin and encoded coordinates with optional waypoint',()=>{
  const url=new URL(serviceDirections({lat:1,lng:2},{lat:0,lng:0},{lat:3,lng:4}));
  assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('origin'),'0,0');assert.equal(url.searchParams.get('destination'),'1,2');assert.equal(url.searchParams.get('waypoints'),'3,4');
  assert.throws(()=>serviceDirections({lat:100,lng:0}));
});
