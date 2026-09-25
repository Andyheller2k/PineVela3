/**
 * PineVela full logical E2E + against-tests (API-level).
 * Run: node scripts/e2e-full-flow.mjs
 */
const BASE = process.env.PINEVELA_BASE || 'http://127.0.0.1:3000';
const TS = Date.now();

const results = [];
function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`  ✅ PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.log(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function section(title) {
  console.log(`\n══ ${title} ══`);
}

async function req(method, path, { token, body, query } = {}) {
  const url = new URL(path, BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

function expectStatus(name, res, codes, detailExtra = '') {
  const allowed = Array.isArray(codes) ? codes : [codes];
  if (allowed.includes(res.status)) {
    pass(name, `HTTP ${res.status}${detailExtra}`);
    return true;
  }
  fail(name, `expected ${allowed.join('|')} got ${res.status}: ${JSON.stringify(res.data)?.slice(0, 220)}`);
  return false;
}

async function registerUnified(name, email, password) {
  const r1 = await req('POST', '/api/auth/register-unified', {
    body: { name, email, password }
  });
  if (!r1.ok || !r1.data?.code) {
    throw new Error(`register-unified failed for ${email}: ${JSON.stringify(r1.data)}`);
  }
  const r2 = await req('POST', '/api/auth/verify-unified', {
    body: { email, code: r1.data.code }
  });
  if (!r2.ok || !r2.data?.token) {
    throw new Error(`verify-unified failed for ${email}: ${JSON.stringify(r2.data)}`);
  }
  return {
    ...r2.data.user,
    token: r2.data.token,
    password,
    email
  };
}

async function login(email, password) {
  return req('POST', '/api/auth/login', {
    body: { usernameOrEmail: email, password }
  });
}

async function main() {
  console.log(`PineVela E2E against ${BASE} (run id ${TS})`);

  // Health
  const health = await req('GET', '/api/health');
  if (!health.ok) {
    console.error('Server not reachable. Start with: npm run dev');
    process.exit(1);
  }
  pass('server health', 'ok');

  // ── Admin login ──
  section('0. Admin session');
  let admin = await login('admin@pinevela.com', 'admin123');
  if (!admin.ok) {
    // fallback seed admin
    admin = await login('andyheller2k@gmail.com', '1782@HellerPine');
  }
  if (!expectStatus('admin login', admin, 200)) {
    console.error('Cannot continue without admin');
    process.exit(1);
  }
  const adminToken = admin.data.token;

  // ═══════════════════════════════════════════════
  // HAPPY PATH
  // ═══════════════════════════════════════════════
  section('1. Create primary user A (future manager parent)');
  const userA = await registerUnified(
    'E2E Manager Parent',
    `e2e.manager.parent.${TS}@gmail.com`,
    'ParentPass1!'
  );
  pass('user A created', userA.email);

  section('2. User A registers manager sub-account');
  const mgrEmail = `ops.${TS}@ayeduasehostel.com`;
  const mgrReg = await req('POST', '/api/auth/register-manager-account', {
    token: userA.token,
    body: {
      managerName: 'E2E Hostel Manager',
      managerEmail: mgrEmail,
      password: 'ManagerPass1!',
      managerPhone: '+233241111001',
      nationalId: 'GHA-712345678-1',
      organization: 'Ayeduase Premium Hostels Ltd',
      roleTitle: 'Property Manager',
      experienceYears: 3,
      address: 'Ayeduase, Kumasi near KNUST',
      knustAccreditedConfirmed: true,
      parentUserEmail: userA.email,
      parentUserId: userA.id,
      userId: userA.id,
      userEmail: userA.email
    }
  });
  expectStatus('manager registration accepted', mgrReg, [200, 201]);
  const managerReqId =
    mgrReg.data?.verification?.id ||
    mgrReg.data?.request?.id ||
    mgrReg.data?.id ||
    mgrReg.data?.managerId ||
    null;

  // Find pending manager verification/request
  const mgrList = await req('GET', '/api/manager-verifications', { token: adminToken });
  const mgrReqs = await req('GET', '/api/manager-requests', { token: adminToken });
  const allMgr = [
    ...(Array.isArray(mgrList.data) ? mgrList.data : []),
    ...(Array.isArray(mgrReqs.data) ? mgrReqs.data : [])
  ];
  const mgrRecord =
    allMgr.find((m) => (m.managerEmail || '').toLowerCase() === mgrEmail) ||
    allMgr.find((m) => m.id === managerReqId);
  if (!mgrRecord) {
    fail('locate manager pending record', `not found for ${mgrEmail}`);
  } else {
    pass('manager pending record found', mgrRecord.id || mgrRecord.managerId);
  }

  section('3. Admin document verify + approve manager');
  const mgrId = mgrRecord?.id || mgrRecord?.managerId || managerReqId;
  if (mgrId) {
    for (const docKey of ['operatingCertificate', 'idFront', 'idBack']) {
      const vd = await req('PUT', `/api/manager-verifications/${mgrId}/verify-doc`, {
        token: adminToken,
        body: { docKey, status: 'verified' }
      });
      expectStatus(`verify doc ${docKey}`, vd, [200, 201]);
    }
    const approveMgr = await req('PUT', `/api/manager-verifications/${mgrId}/approve`, {
      token: adminToken,
      body: {}
    });
    // also try manager-requests path if needed
    if (!approveMgr.ok) {
      const approveMgr2 = await req('PUT', `/api/manager-requests/${mgrId}/approve`, {
        token: adminToken,
        body: {}
      });
      expectStatus('admin approve manager', approveMgr2, [200, 201]);
    } else {
      expectStatus('admin approve manager', approveMgr, [200, 201]);
    }
  }

  const mgrLogin = await login(mgrEmail, 'ManagerPass1!');
  expectStatus('approved manager can login', mgrLogin, 200);
  const managerToken = mgrLogin.data?.token;
  const managerId = mgrLogin.data?.id;

  section('4. Manager registers hostel → admin approves');
  const hostelReg = await req('POST', '/api/hostels/register', {
    token: managerToken,
    body: {
      name: `E2E Premium Inn ${TS}`,
      location: 'Ayeduase, Kumasi KNUST Area',
      city: 'Kumasi',
      wing: 'Block A',
      digitalAddress: 'AK-123-4567',
      totalCapacity: 40,
      totalBlocks: 2,
      bedsLeft: 40,
      availableSpaces: 40,
      price: 4200,
      currency: 'GHS',
      description: 'E2E test hostel near KNUST',
      knustAccreditedConfirmed: true
    }
  });
  expectStatus('hostel registration', hostelReg, [200, 201]);
  const hostelId = hostelReg.data?.hostel?.id || hostelReg.data?.id;
  const hostelName = hostelReg.data?.hostel?.name || `E2E Premium Inn ${TS}`;

  if (hostelId) {
    const pendingOk =
      hostelReg.data?.hostel?.isApproved === false ||
      /pending/i.test(hostelReg.data?.hostel?.approvalStatus || hostelReg.data?.hostel?.status || '');
    if (pendingOk) pass('hostel starts pending approval');
    else fail('hostel starts pending approval', JSON.stringify(hostelReg.data?.hostel)?.slice(0, 180));

    const approveHostel = await req('PUT', `/api/hostels/${hostelId}/verify`, {
      token: adminToken,
      body: { isApproved: true, approvalStatus: 'Approved', status: 'Approved' }
    });
    expectStatus('admin approve hostel', approveHostel, 200);
  } else {
    fail('hostel id present', JSON.stringify(hostelReg.data)?.slice(0, 200));
  }

  section('5. Create user B → register staff sub-account');
  const userB = await registerUnified(
    'E2E Staff Parent',
    `e2e.staff.parent.${TS}@gmail.com`,
    'StaffParent1!'
  );
  pass('user B created', userB.email);

  const staffEmail = `staff.${TS}@technician.gh`;
  const staffReg = await req('POST', '/api/auth/register-staff', {
    token: userB.token,
    body: {
      name: 'E2E Electrician',
      email: staffEmail,
      password: 'StaffPass1!',
      phone: '+233241111002',
      role: 'Electrician',
      specialization: 'Electrical / Backup Power',
      yearsExperience: 4,
      nationalId: 'GHA-712345679-2',
      idType: 'Ghana Card',
      cvFileName: 'cv.pdf',
      cvData: 'Experienced electrician CV content for E2E',
      declarationAccepted: true,
      parentUserId: userB.id,
      parentUserEmail: userB.email,
      userId: userB.id,
      userEmail: userB.email
    }
  });
  expectStatus('staff registration', staffReg, [200, 201]);
  const staffId = staffReg.data?.user?.id || staffReg.data?.id || staffReg.data?.staff?.id;

  section('6. Against: staff cannot apply for hostel job before admin verifies');
  const staffLoginPending = await login(staffEmail, 'StaffPass1!');
  const staffPendingToken = staffLoginPending.data?.token;
  if (staffLoginPending.ok && staffPendingToken) {
    const earlyApply = await req('POST', '/api/staff-applications', {
      token: staffPendingToken,
      body: {
        applicantName: 'E2E Electrician',
        email: staffEmail,
        phone: '+233241111002',
        role: 'Electrician',
        hostelId,
        hostelName,
        nationalId: 'GHA-712345679-2',
        coverLetter: 'Please hire me early'
      }
    });
    expectStatus('block unverified staff job application', earlyApply, [403, 400]);
  } else {
    fail('staff pending login for against-test', JSON.stringify(staffLoginPending.data)?.slice(0, 180));
  }

  section('7. Admin approves staff credentials');
  const staffDecisionId = staffId || staffEmail;
  const staffApprove = await req('PUT', `/api/admin/staff-verifications/${encodeURIComponent(staffDecisionId)}/decision`, {
    token: adminToken,
    body: { status: 'Verified', reviewNotes: 'E2E verified' }
  });
  expectStatus('admin verify staff', staffApprove, [200, 201]);

  const staffLogin = await login(staffEmail, 'StaffPass1!');
  expectStatus('verified staff login', staffLogin, 200);
  const staffToken = staffLogin.data?.token;

  section('8. Staff applies to hostel → manager accepts');
  const staffApply = await req('POST', '/api/staff-applications', {
    token: staffToken,
    body: {
      applicantName: 'E2E Electrician',
      email: staffEmail,
      phone: '+233241111002',
      role: 'Electrician',
      hostelId,
      hostelName,
      nationalId: 'GHA-712345679-2',
      coverLetter: 'Ready to maintain electrical systems'
    }
  });
  expectStatus('staff job application', staffApply, [200, 201]);
  const applicationId = staffApply.data?.application?.id || staffApply.data?.id;

  if (applicationId) {
    const acceptApp = await req('PUT', `/api/staff-applications/${applicationId}/decision`, {
      token: managerToken,
      body: { decision: 'Approved', status: 'Approved' }
    });
    expectStatus('manager accept staff application', acceptApp, [200, 201]);
  } else {
    fail('staff application id', JSON.stringify(staffApply.data)?.slice(0, 200));
  }

  section('9. Create user C → claim room key → file complaint');
  // Generate keys as manager
  const genKeys = await req('POST', `/api/hostels/${hostelId}/generate-room-keys`, {
    token: managerToken,
    body: {}
  });
  expectStatus('generate room keys', genKeys, 200);
  const roomKey =
    genKeys.data?.generatedKeys?.[0]?.roomKey ||
    genKeys.data?.generatedKeys?.[0]?.code ||
    genKeys.data?.keys?.[0]?.roomKey;

  const userC = await registerUnified(
    'E2E Resident Merchant',
    `e2e.resident.${TS}@gmail.com`,
    'ResidentPass1!'
  );
  pass('user C created', userC.email);

  if (!roomKey) {
    fail('room key available', JSON.stringify(genKeys.data)?.slice(0, 220));
  } else {
    const claim = await req('POST', '/api/residents/onboard', {
      token: userC.token,
      body: {
        roomKey,
        name: 'E2E Resident',
        email: `resident.${TS}@st.knust.edu.gh`,
        phone: '+233241111003',
        password: 'ResidentPass1!',
        parentUserEmail: userC.email,
        parentUserId: userC.id,
        userId: userC.id
      }
    });
    expectStatus('claim room key / onboard resident', claim, [200, 201]);
  }

  // Resident may need to login as student — try user C session and student email
  let residentToken = userC.token;
  const stuLogin = await login(`resident.${TS}@st.knust.edu.gh`, 'ResidentPass1!');
  if (stuLogin.ok) {
    residentToken = stuLogin.data.token;
    pass('resident student login', stuLogin.data.role || 'ok');
  } else {
    // fallback: re-login primary and check registered accounts
    const relog = await login(userC.email, 'ResidentPass1!');
    if (relog.ok) {
      residentToken = relog.data.token;
      pass('resident uses primary session after claim');
    } else {
      fail('resident login after claim', JSON.stringify(stuLogin.data)?.slice(0, 180));
    }
  }

  const complaint = await req('POST', '/api/issue-reports', {
    token: residentToken,
    body: {
      title: 'No power in room',
      description: 'Socket sparking near bed — need electrician ASAP',
      category: 'Electrical',
      priority: 'High',
      hostelId,
      hostelName,
      roomKey,
      roomNumber: '101'
    }
  });
  expectStatus('file complaint / issue report', complaint, [200, 201]);
  const issueId = complaint.data?.id || complaint.data?.report?.id;

  // Notifications check for manager after complaint
  const mgrNotifs = await req('GET', '/api/notifications', { token: managerToken });
  if (mgrNotifs.ok && Array.isArray(mgrNotifs.data) && mgrNotifs.data.length > 0) {
    pass('manager notifications present after complaint', `${mgrNotifs.data.length} items`);
  } else if (mgrNotifs.ok) {
    // some implementations filter by role — soft warn
    fail('manager notifications after complaint', `empty or unexpected: ${JSON.stringify(mgrNotifs.data)?.slice(0, 120)}`);
  } else {
    fail('fetch manager notifications', `HTTP ${mgrNotifs.status}`);
  }

  section('10. Same user C registers digital market → admin approve → add product');
  const dmStudentEmail = `merchant.${TS}@st.knust.edu.gh`;
  const dmReg = await req('POST', '/api/digital-market/register', {
    token: userC.token,
    body: {
      fullName: 'E2E Merchant Student',
      university: 'KNUST',
      studentEmail: dmStudentEmail,
      parentUserEmail: userC.email,
      userId: userC.id,
      categoryToSell: 'Electronics',
      whatToSell: 'Laptops and chargers',
      idNumber: 'GHA-712345680-3',
      password: 'MerchantPass1!'
    }
  });
  expectStatus('digital market application', dmReg, [200, 201]);
  const dmAppId = dmReg.data?.application?.id || dmReg.data?.id;

  // Pending merchant should not fully login as market yet
  const pendingDmLogin = await login(dmStudentEmail, 'MerchantPass1!');
  if (pendingDmLogin.status === 403 && pendingDmLogin.data?.isPendingApproval) {
    pass('pending market applicant blocked from full login');
  } else if (!pendingDmLogin.ok) {
    pass('pending market applicant not fully admitted', `HTTP ${pendingDmLogin.status}`);
  } else {
    fail('pending market applicant blocked from full login', 'login succeeded unexpectedly');
  }

  const dmApprove = await req('POST', '/api/admin/digital-market/approve-application', {
    token: adminToken,
    body: { id: dmAppId, applicationId: dmAppId, adminNotes: 'E2E approve' }
  });
  expectStatus('admin approve digital market', dmApprove, [200, 201]);

  const storeSetup = await req('POST', '/api/digital-market/store-setup', {
    token: userC.token,
    body: {
      storeName: `E2E Campus Mart ${TS}`,
      category: 'Electronics',
      description: 'Student gadgets',
      phone: '+233241111003',
      studentEmail: dmStudentEmail,
      userEmail: dmStudentEmail,
      userId: userC.id,
      paymentMethod: 'MTN MoMo',
      paymentPhone: '0241111003',
      transactionRef: `E2E-TX-${TS}`
    }
  });
  expectStatus('digital market store setup', storeSetup, [200, 201]);
  const storeId = storeSetup.data?.store?.id || storeSetup.data?.id || dmApprove.data?.store?.id;

  // Merchant login after setup
  let merchantToken = userC.token;
  const merchLogin = await login(dmStudentEmail, 'MerchantPass1!');
  if (merchLogin.ok) {
    merchantToken = merchLogin.data.token;
    pass('merchant login after approval+setup');
  } else {
    // may still use primary
    const primaryRelog = await login(userC.email, 'ResidentPass1!');
    if (primaryRelog.ok) {
      merchantToken = primaryRelog.data.token;
      pass('merchant operates via primary user token');
    } else {
      fail('merchant login', JSON.stringify(merchLogin.data)?.slice(0, 180));
    }
  }

  const addProduct = await req('POST', '/api/digital-market/products', {
    token: merchantToken,
    body: {
      storeId,
      title: `E2E USB Hub ${TS}`,
      description: 'Brand new 7-port hub',
      price: 85,
      category: 'Electronics',
      stockQuantity: 5,
      condition: 'New',
      userEmail: dmStudentEmail,
      meetingLocation: 'KNUST Main Library Car Park'
    }
  });
  expectStatus('add product to store', addProduct, [200, 201]);
  const productId = addProduct.data?.product?.id || addProduct.data?.id;

  section('11. Create user D → buy product → complete order');
  const userD = await registerUnified(
    'E2E Buyer',
    `e2e.buyer.${TS}@gmail.com`,
    'BuyerPass1!'
  );
  pass('user D created', userD.email);

  const order = await req('POST', '/api/digital-market/orders', {
    token: userD.token,
    body: {
      productId,
      quantity: 1,
      buyerName: 'E2E Buyer',
      buyerEmail: userD.email,
      buyerPhone: '+233241111004',
      buyerId: userD.id,
      meetingLocation: 'KNUST Main Library Car Park',
      meetingLatitude: 6.6745,
      meetingLongitude: -1.5716
    }
  });
  expectStatus('place market order', order, [200, 201]);
  const orderId = order.data?.order?.id || order.data?.id;
  const otpPin = order.data?.order?.otpPin;

  if (orderId) {
    const agree = await req('POST', `/api/digital-market/orders/${orderId}/update-status`, {
      token: merchantToken,
      body: { action: 'agree-location' }
    });
    expectStatus('seller agree meetup location', agree, 200);

    const complete = await req('POST', `/api/digital-market/orders/${orderId}/update-status`, {
      token: merchantToken,
      body: { status: 'Completed & Paid', inputPin: otpPin, notes: 'Delivered and paid' }
    });
    expectStatus('complete order with PIN', complete, 200);
    if (complete.data?.order?.status === 'Completed & Paid' || /completed/i.test(complete.data?.message || '')) {
      pass('order completed successfully');
    } else if (complete.ok) {
      pass('order update accepted', complete.data?.order?.status || '');
    }
  } else {
    fail('order id present', JSON.stringify(order.data)?.slice(0, 200));
  }

  // Buyer notification after seller agree
  const buyerNotifs = await req('GET', '/api/notifications', { token: userD.token });
  if (buyerNotifs.ok && Array.isArray(buyerNotifs.data) && buyerNotifs.data.some((n) => /meetup|purchase|order/i.test(`${n.title} ${n.message}`))) {
    pass('buyer received order/meetup notification');
  } else if (buyerNotifs.ok) {
    fail('buyer order notification', `no matching notif in ${buyerNotifs.data?.length || 0}`);
  } else {
    fail('fetch buyer notifications', `HTTP ${buyerNotifs.status}`);
  }

  section('12. Account harmony / registered accounts');
  // Re-login primaries: session tokens rotate on each login, so stale tokens from earlier steps are invalid
  const userAFresh = await login(userA.email, userA.password);
  const userBFresh = await login(userB.email, userB.password);
  const userCFresh = await login(userC.email, userC.password);
  if (!userAFresh.ok || !userBFresh.ok || !userCFresh.ok) {
    fail('re-login primary accounts for harmony check', JSON.stringify({
      a: userAFresh.status, b: userBFresh.status, c: userCFresh.status
    }));
  } else {
    pass('re-login primary accounts for harmony check');
  }
  userA.token = userAFresh.data?.token || userA.token;
  userB.token = userBFresh.data?.token || userB.token;
  userC.token = userCFresh.data?.token || userC.token;

  const accountsA = await req('GET', '/api/users/my-registered-accounts', {
    token: userA.token
  });
  expectStatus('user A registered accounts', accountsA, 200);
  if (accountsA.data?.managerAccount) pass('user A has manager sub-account linked');
  else fail('user A manager sub-account linked', JSON.stringify(accountsA.data)?.slice(0, 200));

  const accountsB = await req('GET', '/api/users/my-registered-accounts', {
    token: userB.token
  });
  expectStatus('user B registered accounts', accountsB, 200);
  if (accountsB.data?.staffAccount) pass('user B has staff sub-account linked');
  else fail('user B staff sub-account linked', JSON.stringify(accountsB.data)?.slice(0, 200));

  const accountsC = await req('GET', '/api/users/my-registered-accounts', {
    token: userC.token
  });
  expectStatus('user C registered accounts', accountsC, 200);
  const hasResident = Boolean(accountsC.data?.residentAccount);
  const hasMarket =
    Boolean(accountsC.data?.digitalMarketAccount) ||
    Boolean(accountsC.data?.merchantAccount) ||
    Boolean(accountsC.data?.digitalMarketStore);
  if (hasResident) pass('user C resident sub-account linked');
  else fail('user C resident sub-account linked', JSON.stringify(accountsC.data)?.slice(0, 220));
  if (hasMarket) pass('user C market sub-account linked');
  else {
    // soft: market may only be on applications list
    const dmStatus = await req('GET', '/api/digital-market/status', {
      query: { email: dmStudentEmail, userId: userC.id }
    });
    if (dmStatus.ok && (dmStatus.data?.store || dmStatus.data?.application || dmStatus.data?.status)) {
      pass('user C market status available via status endpoint');
    } else {
      fail('user C market sub-account linked', JSON.stringify({ accounts: accountsC.data, status: dmStatus.data })?.slice(0, 240));
    }
  }

  // ═══════════════════════════════════════════════
  // AGAINST TESTS
  // ═══════════════════════════════════════════════
  section('AGAINST 1. Manager cannot register with primary/personal email');
  const badMgrPrimary = await req('POST', '/api/auth/register-manager-account', {
    token: userA.token,
    body: {
      managerName: 'Bad Manager',
      managerEmail: userA.email, // primary gmail
      password: 'BadPass1!',
      managerPhone: '+233241111099',
      address: 'Ayeduase Kumasi KNUST',
      knustAccreditedConfirmed: true,
      parentUserEmail: userA.email,
      userEmail: userA.email
    }
  });
  expectStatus('reject manager using primary email', badMgrPrimary, [400, 403]);

  const badMgrGmail = await req('POST', '/api/auth/register-manager-account', {
    token: userD.token,
    body: {
      managerName: 'Gmail Manager',
      managerEmail: `fake.mgr.${TS}@gmail.com`,
      password: 'BadPass1!',
      managerPhone: '+233241111098',
      address: 'Ayeduase Kumasi KNUST',
      knustAccreditedConfirmed: true,
      parentUserEmail: userD.email,
      userEmail: userD.email
    }
  });
  expectStatus('reject manager personal gmail domain', badMgrGmail, [400, 403]);

  section('AGAINST 2. Manager cannot approve without verified docs');
  // create a fresh manager pending and try approve without docs
  const mgr2Email = `ops2.${TS}@koteiinn.com`;
  const userE = await registerUnified(`E2E Parent2 ${TS}`, `e2e.parent2.${TS}@gmail.com`, 'Parent2Pass!');
  const mgr2 = await req('POST', '/api/auth/register-manager-account', {
    token: userE.token,
    body: {
      managerName: 'E2E Mgr Pending Docs',
      managerEmail: mgr2Email,
      password: 'Manager2Pass!',
      managerPhone: '+233241111097',
      address: 'Kotei, Kumasi KNUST',
      knustAccreditedConfirmed: true,
      parentUserEmail: userE.email,
      userEmail: userE.email,
      userId: userE.id
    }
  });
  const mgr2List = await req('GET', '/api/manager-verifications', { token: adminToken });
  const mgr2Rec = (Array.isArray(mgr2List.data) ? mgr2List.data : []).find(
    (m) => (m.managerEmail || '').toLowerCase() === mgr2Email
  );
  if (mgr2.ok && mgr2Rec?.id) {
    const forceLess = await req('PUT', `/api/manager-verifications/${mgr2Rec.id}/approve`, {
      token: adminToken,
      body: {}
    });
    expectStatus('block approve manager without docs', forceLess, [400, 403]);
  } else {
    fail('setup manager for docs against-test', JSON.stringify(mgr2.data)?.slice(0, 180));
  }

  section('AGAINST 3. Unapproved hostel cannot be double-registered by same manager');
  const hostel2 = await req('POST', '/api/hostels/register', {
    token: managerToken,
    body: {
      name: `E2E Second Hostel ${TS}`,
      location: 'Bomso Kumasi KNUST',
      totalCapacity: 20,
      knustAccreditedConfirmed: true
    }
  });
  expectStatus('block second hostel for same manager', hostel2, [400, 403]);

  section('AGAINST 4. Digital market rejects non-university email / bad Ghana Card');
  const badDmEmail = await req('POST', '/api/digital-market/register', {
    token: userD.token,
    body: {
      fullName: 'Bad Merchant',
      university: 'KNUST',
      studentEmail: userD.email,
      parentUserEmail: userD.email,
      userId: userD.id,
      idNumber: 'GHA-712345681-4',
      password: 'Xpass1!'
    }
  });
  expectStatus('reject market with gmail student email', badDmEmail, [400, 403]);

  const badCard = await req('POST', '/api/digital-market/register', {
    token: userD.token,
    body: {
      fullName: 'Bad Card',
      university: 'KNUST',
      studentEmail: `badcard.${TS}@st.knust.edu.gh`,
      parentUserEmail: userD.email,
      userId: userD.id,
      idNumber: '12345',
      password: 'Xpass1!'
    }
  });
  expectStatus('reject invalid Ghana Card format', badCard, [400, 403]);

  section('AGAINST 5. Store setup before admin approval');
  const userF = await registerUnified(`E2E Early ${TS}`, `e2e.early.${TS}@gmail.com`, 'EarlyPass1!');
  const earlyDm = await req('POST', '/api/digital-market/register', {
    token: userF.token,
    body: {
      fullName: 'Early Merchant',
      university: 'KNUST',
      studentEmail: `early.${TS}@st.knust.edu.gh`,
      parentUserEmail: userF.email,
      userId: userF.id,
      idNumber: 'GHA-712345682-5',
      password: 'EarlyMerch1!'
    }
  });
  if (earlyDm.ok) {
    const earlySetup = await req('POST', '/api/digital-market/store-setup', {
      token: userF.token,
      body: {
        storeName: 'Too Early Store',
        studentEmail: `early.${TS}@st.knust.edu.gh`,
        userEmail: `early.${TS}@st.knust.edu.gh`,
        userId: userF.id,
        transactionRef: 'EARLY'
      }
    });
    expectStatus('block store setup before approval', earlySetup, [403, 400]);
  } else {
    fail('setup early market app', JSON.stringify(earlyDm.data)?.slice(0, 160));
  }

  section('AGAINST 6. Banned staff account must not login / act');
  if (staffDecisionId) {
    const ban = await req('PUT', `/api/admin/staff-verifications/${encodeURIComponent(staffDecisionId)}/status`, {
      token: adminToken,
      body: { accountStatus: 'Banned', reason: 'E2E ban test' }
    });
    expectStatus('admin ban staff', ban, 200);
    const bannedLogin = await login(staffEmail, 'StaffPass1!');
    if (!bannedLogin.ok) {
      pass('banned staff cannot login', `HTTP ${bannedLogin.status}`);
    } else {
      fail('banned staff cannot login', 'login still succeeded — ban not enforced at login');
    }
    // restore for cleanliness
    await req('PUT', `/api/admin/staff-verifications/${encodeURIComponent(staffDecisionId)}/status`, {
      token: adminToken,
      body: { accountStatus: 'Active', reason: 'E2E restore' }
    });
  }

  section('AGAINST 7. Banned digital market store cannot receive orders');
  if (storeId && productId) {
    const banStore = await req('POST', '/api/admin/digital-market/toggle-ban-store', {
      token: adminToken,
      body: { storeId, id: storeId }
    });
    expectStatus('admin ban market store', banStore, 200);
    const orderBanned = await req('POST', '/api/digital-market/orders', {
      token: userD.token,
      body: {
        productId,
        quantity: 1,
        buyerName: 'E2E Buyer',
        buyerEmail: userD.email,
        buyerId: userD.id,
        meetingLocation: 'Campus'
      }
    });
    expectStatus('block order from banned store', orderBanned, [403, 400]);
    // unban
    await req('POST', '/api/admin/digital-market/toggle-ban-store', {
      token: adminToken,
      body: { storeId, id: storeId }
    });
  }

  section('AGAINST 8. Complete order with wrong PIN must fail');
  // create a fresh product/order for PIN test
  const addProduct2 = await req('POST', '/api/digital-market/products', {
    token: merchantToken,
    body: {
      storeId,
      title: `E2E PIN Test ${TS}`,
      description: 'PIN guard',
      price: 40,
      category: 'Electronics',
      stockQuantity: 2,
      userEmail: dmStudentEmail
    }
  });
  const product2 = addProduct2.data?.product?.id || addProduct2.data?.id;
  if (product2) {
    const order2 = await req('POST', '/api/digital-market/orders', {
      token: userD.token,
      body: {
        productId: product2,
        quantity: 1,
        buyerName: 'E2E Buyer',
        buyerEmail: userD.email,
        buyerId: userD.id,
        meetingLocation: 'Campus Gate'
      }
    });
    const oid2 = order2.data?.order?.id;
    if (oid2) {
      await req('POST', `/api/digital-market/orders/${oid2}/update-status`, {
        token: merchantToken,
        body: { action: 'agree-location' }
      });
      const badPin = await req('POST', `/api/digital-market/orders/${oid2}/update-status`, {
        token: merchantToken,
        body: { status: 'Completed & Paid', inputPin: '0000' }
      });
      expectStatus('reject wrong delivery PIN', badPin, [400, 403]);

      const emptyPin = await req('POST', `/api/digital-market/orders/${oid2}/update-status`, {
        token: merchantToken,
        body: { status: 'Completed & Paid' }
      });
      if (!emptyPin.ok) {
        pass('reject completion without PIN', `HTTP ${emptyPin.status}`);
      } else {
        fail('reject completion without PIN', 'order completed with empty PIN — rule not enforced');
      }
    } else {
      fail('PIN test order created', JSON.stringify(order2.data)?.slice(0, 160));
    }
  }

  section('AGAINST 9. Forged / unauthenticated access');
  const forge = await req('GET', '/api/auth/me', { token: 'token_admin_andyheller2k' });
  expectStatus('reject forged admin token', forge, 401);
  const noAuthApprove = await req('PUT', `/api/hostels/${hostelId}/verify`, {
    body: { isApproved: true }
  });
  expectStatus('reject unauthenticated hostel approve', noAuthApprove, [401, 403]);

  section('AGAINST 10. Accra location rejected for manager');
  const badLoc = await req('POST', '/api/auth/register-manager-account', {
    token: userD.token,
    body: {
      managerName: 'Accra Manager',
      managerEmail: `accra.${TS}@spintexhostel.com`,
      password: 'AccraPass1!',
      address: 'Spintex Road, Accra',
      knustAccreditedConfirmed: true,
      parentUserEmail: userD.email,
      userEmail: userD.email
    }
  });
  expectStatus('reject non-Kumasi manager location', badLoc, [400, 403]);

  // Summary
  section('SUMMARY');
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nTotal: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
  if (failed) {
    console.log('\nFailed cases:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - ${r.name}: ${r.detail}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(2);
});
