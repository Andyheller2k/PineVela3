import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResidenceRegistration } from '../supabase/residenceRegistration';

const block = (number: number) => ({
  name: `Block ${number}`, gender: 'Mixed', floors: 1, roomPrefix: `B${number}`,
  startNum: number * 100 + 1,
  roomTypes: [{ typeName: '2 in 1 Room', bedsPerRoom: 2, totalRooms: 1 }],
});
const registration = (blocksList: ReturnType<typeof block>[]) => ({
  name: 'Boundary Residence', managerName: 'Boundary Residence Team', addressLine1: 'Campus Road', latitude: 6.7, longitude: -1.6,
  contactEmail: 'manager@example.com', contactPhone: '+233241234567', contactPhoneCountry: 'GH',
  genderCategory: 'Mixed', wing: 'Hostel', yearEstablished: 2020,
  paymentFrequency: 'Per Academic Year', agreeTerms: true, accuracyCertified: true,
  gallery: ['owned-photo'], imageUrl: 'owned-photo', hostelType: 'Student accommodation',
  city: 'Kumasi', region: 'Ashanti', country: 'Ghana', blocksList,
});

test('registration accepts one through ten distinct blocks', () => {
  assert.equal(parseResidenceRegistration(registration([block(1)])).blocksList.length, 1);
  assert.equal(parseResidenceRegistration(registration(Array.from({ length: 10 }, (_, i) => block(i + 1)))).blocksList.length, 10);
});

test('registration rejects zero or eleven blocks before persistence', () => {
  for (const count of [0, 11]) {
    assert.throws(() => parseResidenceRegistration(registration(Array.from({ length: count }, (_, i) => block(i + 1)))),
      /between one and ten actual blocks/);
  }
});
