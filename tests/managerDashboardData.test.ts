import assert from 'node:assert/strict';
import test from 'node:test';
import { loadManagerDashboardData } from '../src/lib/managerDashboardData';
import { publicResidenceContact } from '../src/lib/residenceCatalog';
import { parseResidenceRegistration } from '../supabase/residenceRegistration';
import { residenceFields } from '../supabase/residenceChanges';

const home = { id: 'owned-home', name: 'Owned Residence', registrationStatus: 'approved' };

test('manager property loads when an independent dashboard section fails', async () => {
  const called: string[] = [];
  const result = await loadManagerDashboardData(async path => {
    called.push(path);
    if (path === '/api/manager/my-hostel') return { hostel: home };
    if (path === '/api/staff') throw Object.assign(new Error('Temporary staff read failure'), { status: 503 });
    if (path === '/api/issue-reports') return [
      { id: 'own-issue', hostelId: home.id, hostelName: home.name },
      { id: 'foreign-issue', hostelId: 'another-home', hostelName: 'Another Residence' },
    ];
    return [];
  });
  assert.deepEqual(result.managerProperties, [home]);
  assert.deepEqual(result.mappedIssues.map(issue => issue.id), ['own-issue']);
  assert.deepEqual(result.staffList, []);
  assert.deepEqual(result.failedSections, ['staff']);
  assert.equal(called.includes('/api/hostels'), false);
});

test('manager authorization failure stays fatal instead of rendering a partial portal', async () => {
  await assert.rejects(() => loadManagerDashboardData(async path => {
    if (path === '/api/manager/my-hostel') return { hostel: home };
    if (path === '/api/room-keys') throw Object.assign(new Error('Session denied'), { status: 403 });
    return [];
  }), /Session denied/);
  await assert.rejects(() => loadManagerDashboardData(async path => {
    if (path === '/api/manager/my-hostel') throw new Error('Residence read failed');
    return [];
  }), /Residence read failed/);
});

test('public residence contact never silently exposes an account profile', () => {
  assert.deepEqual(publicResidenceContact({ id: 'home', name: 'Pine Residence', managerName: 'Public Manager' }),
    { label: 'Manager', value: 'Public Manager' });
  assert.deepEqual(publicResidenceContact({ id: 'home', name: 'Pine Residence', contact_email: 'property@example.com' }),
    { label: 'Property contact', value: 'property@example.com' });
});

test('approved residence change editor does not treat private profile name as published contact', async () => {
  const fields = await residenceFields({
    query: async (sql: string) => ({ rows: sql.includes('public.account_contexts')
      ? [{ phone: '+233241234567', display_name: 'Private Login Name' }]
      : [] }),
  } as any, {
    id: 'owned-home', name: 'Owned Residence', cover_path: '', gallery_paths: [],
    manager_contact_name: null, contact_phone: null, contact_country: 'GH',
  }, 'assigned-manager');
  assert.equal(fields.managerName, '');
  assert.equal(fields.managerPhone, '+233241234567');
});

test('residence registration requires an explicit public manager contact name', () => {
  const input = {
    name: 'Pine Residence', managerName: 'Public Manager', addressLine1: 'Campus Road',
    latitude: 6.7, longitude: -1.6, contactEmail: 'property@example.com',
    contactPhone: '+233241234567', contactPhoneCountry: 'GH', genderCategory: 'Mixed',
    wing: 'Hostel', yearEstablished: 2020, paymentFrequency: 'Per Academic Year',
    agreeTerms: true, accuracyCertified: true, gallery: ['owned-photo'], imageUrl: 'owned-photo',
    hostelType: 'Student accommodation', city: 'Kumasi', region: 'Ashanti', country: 'Ghana',
    blocksList: [{ name: 'Block A', gender: 'Mixed', floors: 1, roomPrefix: 'A', startNum: 101,
      roomTypes: [{ typeName: '2 in 1 Room', bedsPerRoom: 2, totalRooms: 1 }] }],
  };
  assert.equal(parseResidenceRegistration(input).managerName, 'Public Manager');
  assert.throws(() => parseResidenceRegistration({ ...input, managerName: '' }), /residence fields/);
});
