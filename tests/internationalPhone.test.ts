import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internationalPhone, phoneCountries, phoneDraft } from '../internationalPhone.js';
import { activeHostelFields, retiredHostelFields } from '../hostelRegistrationFields.js';

test('International contact validation accepts mobile, landline and toll-free numbers across countries', () => {
  for (const [country, input, expected] of [
    ['GH', '0241234567', '+233241234567'], ['GH', '0302123456', '+233302123456'],
    ['GB', '02079460018', '+442079460018'], ['US', '2025550123', '+12025550123'],
    ['US', '8002345678', '+18002345678'], ['CA', '4165550123', '+14165550123'],
    ['IN', '9876543210', '+919876543210'], ['AU', '0293744000', '+61293744000']
  ]) assert.equal(internationalPhone(input, country).number, expected);
  assert.equal(internationalPhone('+44 (20) 7946-0018', 'GB').country, 'GB');
  assert(phoneCountries.length > 200);assert.equal(new Set(phoneCountries.map(c=>c.code)).size, phoneCountries.length);
  assert.deepEqual(phoneCountries.map(c=>c.name),phoneCountries.map(c=>c.name).sort((a,b)=>a.localeCompare(b,'en')));
});
test('Country mismatch, shared country codes, letters, malformed and incomplete inputs are rejected',()=>{
  for(const [value,country] of [['+12025550123','GH'],['+14165550123','US'],['+12025550123','CA'],['800FLOWERS','US'],['Call +233241234567','GH'],['+233241234567 ext. 1','GH'],['123','GH'],['','GH'],[null,'GH'],[true,'GH'],[241234567,'GH'],['0241234567','XX'],['0241234567',{code:'GH'}]]) assert.throws(()=>internationalPhone(value,country));
});
test('Restored drafts retain their actual phone country and drop retired property sections',()=>{
  assert.deepEqual(phoneDraft('+44 20 7946 0018'),{contactPhone:'2079460018',contactPhoneCountry:'GB'});
  assert.deepEqual(phoneDraft('0241234567'),{contactPhone:'241234567',contactPhoneCountry:'GH'});
  const archive={name:'Saved draft',contactPhone:'0241234567',facilities:['Wi-Fi'],rules:{curfew:'Old policy'},minStay:'Old term'};
  assert.deepEqual(activeHostelFields(archive),{name:'Saved draft',contactPhone:'0241234567'});assert.equal(archive.facilities.length,1);
});
