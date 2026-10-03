/** Read-only review of application code; all API mutations use a disposable local database. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashCredential } from '../accountSecurity.js';
import { sessionFixtureJson } from '../tests/sessionFixtures.cjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-journeys-'));
const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
const db = path.join(dataDir, 'pinevela_store.json');
const results: { name: string; pass: boolean; detail: string }[] = [];
const record = (name: string, pass: boolean, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); };
const admin = { id: crypto.randomUUID(), email: 'journey-admin@example.test', role: 'admin', name: 'Disposable journey administrator', token: crypto.randomUUID(), password: hashCredential(crypto.randomUUID()) };
await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [admin] }));
const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined; let serverErrors = 0;
const raw = async (method: string, route: string, token?: string, body?: any) => {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { data = { error: 'Non-JSON response' }; }
  return { status: response.status, data };
};
const check = async (name: string, method: string, route: string, token: string | undefined, body: any, expected: number | number[], required = false) => {
  const r = await raw(method, route, token, body); const pass = [expected].flat().includes(r.status);
  record(name, pass, `HTTP ${r.status}${!pass ? '; ' + String(r.data.error || 'Unexpected acceptance') : ''}`);
  if (!pass && required) throw new Error(name + ' prevented the next step');
  return r.data;
};
const state = async () => JSON.parse(await fs.readFile(db, 'utf8'));
const signup = async (label: string) => {
  const email = `journey-${label}@example.test`, password = `Journey-${label}-Primary-2026!`;
  const pending = await check(`${label}: request signup code`, 'POST', '/api/auth/register-unified', undefined, { name: `Disposable ${label}`, email, password }, 200, true);
  record(`${label}: six-digit development code`, /^\d{6}$/.test(pending.developmentCode));
  const result = await check(`${label}: verify signup`, 'POST', '/api/auth/verify-unified', undefined, { email, password, signupId: pending.signupId, code: pending.developmentCode }, 201, true);
  return { ...result.user, token: result.token, email, password };
};
const login = async (email: string, password: string) => {
  const result = await check('Account login', 'POST', '/api/auth/login', undefined, { usernameOrEmail: email, password }, 200, true);
  return { ...(result.user || result), token: result.token || result.user?.token };
};
let sellerParent: any, buyer: any, owner: any, merchant: any, store: any, product: any, manager: any, hostel: any, staff: any, staffSession: any, resident: any;
try {
  child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'development', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_DEV_SIGNUP_CODES: 'true', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr?.on('data', () => serverErrors++);
  for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} if (child.exitCode !== null) throw new Error('Isolated server exited'); await new Promise(r => setTimeout(r, 100)); }
  sellerParent = await signup('seller'); buyer = await signup('buyer'); owner = await signup('manager-parent');
  try {
    const marketEmail = 'journey-seller@st.knust.edu.gh', marketPassword = 'Journey-Merchant-2026!';
    const application = (await check('Seller application submitted', 'POST', '/api/digital-market/register', sellerParent.token, { fullName: 'Disposable Seller', university: 'KNUST', studentEmail: marketEmail, categoryToSell: 'Electronics', idNumber: 'S23-JOURNEY', parentUserEmail: sellerParent.email, userId: sellerParent.id, password: marketPassword }, 201, true)).application;
    const applications = await check('Administrator application inbox', 'GET', '/api/admin/digital-market/applications', admin.token, undefined, 200, true);
    record('Seller request appears for administrator', applications.some((a: any) => a.id === application.id));
    await check('Primary account cannot approve market', 'POST', '/api/admin/digital-market/approve-application', sellerParent.token, { id: application.id }, 403);
    await check('Administrator approves market', 'POST', '/api/admin/digital-market/approve-application', admin.token, { id: application.id }, 200, true);
    merchant = await check('Seller account login', 'POST', '/api/digital-market/login', undefined, { studentEmail: marketEmail, password: marketPassword }, 200, true);
    store = (await check('Approved seller completes existing development setup', 'POST', '/api/digital-market/store-setup', merchant.token, { studentEmail: marketEmail, userId: sellerParent.id, storeName: 'Disposable journey store', category: 'Electronics', phone: '+233240000001' }, 200, true)).store;
    product = (await check('Seller publishes item', 'POST', '/api/digital-market/products', merchant.token, { storeId: store.id, userEmail: marketEmail, title: 'Disposable journey item', price: 100, stockQuantity: 3, category: 'Electronics', description: 'Isolated API verification item' }, 201, true)).product;
    const catalog = await check('Buyer opens catalog', 'GET', '/api/digital-market/products', buyer.token, undefined, 200, true);
    record('Published item appears in catalog', (Array.isArray(catalog) ? catalog : catalog.products || []).some((p: any) => p.id === product.id));
    for (const quantity of ['two', '2', -2, 0, 1.5, null, {}, 1e100]) await check(`Reject order quantity ${JSON.stringify(quantity)}`, 'POST', '/api/digital-market/orders', buyer.token, { productId: product.id, quantity }, 400);
    const order = (await check('Buyer places order', 'POST', '/api/digital-market/orders', buyer.token, { productId: product.id, quantity: 1, price: 1, buyerId: owner.id, buyerEmail: owner.email }, 201, true)).order;
    record('Server owns buyer identity and price', order.buyerId === buyer.id && order.productPrice === 100 && order.totalAmount === 100);
    const sellerOrders = await check('Seller receives order', 'GET', '/api/digital-market/my-orders', merchant.token, undefined, 200, true);
    record('Seller response hides buyer PIN', sellerOrders.some((o: any) => o.id === order.id) && !JSON.stringify(sellerOrders).includes(order.otpPin));
    const route = `/api/digital-market/orders/${order.id}/update-status`;
    await check('Cannot complete before acceptance', 'POST', route, merchant.token, { status: 'completed', inputPin: order.otpPin }, 409);
    await check('Seller accepts meeting', 'POST', route, merchant.token, { action: 'agree-location' }, 200, true);
    await check('Incorrect PIN refused', 'POST', route, merchant.token, { status: 'completed', inputPin: 'letters' }, 400);
    await check('Seller completes with buyer PIN', 'POST', route, merchant.token, { status: 'completed', inputPin: order.otpPin }, 200, true);
    record('Completion consumes stock once', (await state()).digitalMarketProducts.find((p: any) => p.id === product.id).stockQuantity === 2);
    await check('Completed order cannot reopen', 'POST', route, merchant.token, { action: 'agree-location' }, 409);
    await check('Buyer rates completed purchase', 'POST', '/api/digital-market/ratings', buyer.token, { orderId: order.id, rating: 5, review: 'Isolated completed purchase' }, 200);
    await check('Other user cannot rate purchase', 'POST', '/api/digital-market/ratings', owner.token, { orderId: order.id, rating: 1 }, 403);
  } catch (error) { record('Marketplace flow completion', false, String(error)); }
  try {
    const managerEmail = 'journey-manager@residence.example.test', managerPassword = 'Journey-Manager-2026!';
    const registered = await check('Manager account requested', 'POST', '/api/auth/register-manager-account', owner.token, { managerName: 'Disposable Manager', managerEmail, password: managerPassword, managerPhone: '+233240000002', location: 'Kumasi KNUST Ayeduase', address: 'Kumasi KNUST Ayeduase', knustAccreditedConfirmed: true, hostelName: 'Disposable journey residence', nationalId: crypto.randomUUID() }, 201, true);
    await check('Pending manager cannot log in', 'POST', '/api/auth/login', undefined, { usernameOrEmail: managerEmail, password: managerPassword }, 403);
    const inbox = await check('Administrator manager inbox', 'GET', '/api/manager-verifications', admin.token, undefined, 200, true);
    const dossier = (Array.isArray(inbox) ? inbox : inbox.verifications || []).find((v: any) => v.managerId === registered.user.id);
    record('Manager request appears for administrator', Boolean(dossier)); if (!dossier) throw new Error('Manager request absent');
    await check('Administrator approves manager', 'PUT', `/api/manager-verifications/${dossier.id}/approve`, admin.token, {}, 200, true);
    manager = await login(managerEmail, managerPassword);
    hostel = (await check('Manager registers residence', 'POST', '/api/hostels/register', manager.token, { name: 'Disposable journey residence', location: 'Kumasi KNUST Ayeduase', totalCapacity: 2, blocks: [{ name: 'A', totalRooms: 2, startNum: 101 }] }, 201, true)).hostel;
    const verification = (await state()).hostelVerifications.find((v: any) => v.hostelId === hostel.id);
    await check('Administrator approves residence', 'PUT', `/api/hostel-verifications/${verification.id}/approve`, admin.token, {}, 200, true);
    const staffBody = { name: 'Disposable Plumber', email: 'journey-staff@example.test', phone: '+233240000003', password: 'Journey-Staff-2026!', role: 'Maintenance', hostelId: hostel.id };
    await check('Staff requires explicit password', 'POST', '/api/staff', manager.token, { ...staffBody, password: undefined }, 400);
    await check('Primary user cannot create staff', 'POST', '/api/staff', buyer.token, staffBody, 403);
    staff = await check('Manager creates own staff', 'POST', '/api/staff', manager.token, staffBody, 201, true);
    staffSession = await login(staffBody.email, staffBody.password);
    await check('Manager generates room keys', 'POST', `/api/hostels/${hostel.id}/generate-room-keys`, manager.token, {}, 200, true);
    const key = (await state()).roomKeys.find((k: any) => k.hostelId === hostel.id);
    const claim = { roomKey: key.roomKey, name: 'Disposable Resident', email: 'journey-resident@st.knust.edu.gh', phone: '+233240000004', password: 'Journey-Resident-2026!' };
    const activated = await check('Primary user activates room', 'POST', '/api/room-keys/claim', buyer.token, claim, 200, true);
    resident = { ...(activated.user || activated), token: activated.token || activated.user?.token };
    await check('Occupied room cannot be claimed again', 'POST', '/api/room-keys/claim', owner.token, { ...claim, email: 'journey-other@st.knust.edu.gh', password: 'Journey-Other-Resident!' }, 409);
    const issue = await check('Resident submits maintenance report', 'POST', '/api/issue-reports', resident.token, { title: 'Leaking tap', description: 'Tap continues dripping after closure', category: 'Plumbing', hostelId: hostel.id, hostelName: hostel.name, blockName: 'A', roomNumber: key.roomNumber }, 201, true);
    const action = (name: string, suffix: string, token: string, body: any, expected = 200, required = true) => check(name, 'POST', `/api/issue-reports/${issue.id}/${suffix}`, token, body, expected, required);
    await action('Early resident confirmation refused', 'student-confirm', resident.token, { isResolved: true, rating: 5 }, 409);
    await action('Manager assigns staff', 'assign', manager.token, { staffId: staff.id, timeframe: '24h' });
    await action('Primary user cannot accept staff task', 'accept-assignment', owner.token, {}, 403);
    await action('Assigned staff accepts', 'accept-assignment', staffSession.token, {});
    await action('Staff completes repair', 'staff-complete', staffSession.token, { completionNotes: 'Replaced washer and checked flow' });
    await action('Text cannot replace resolution boolean', 'student-confirm', resident.token, { isResolved: 'true', rating: 5 }, 400);
    await action('Non-numeric repair rating refused', 'student-confirm', resident.token, { isResolved: true, rating: 'five' }, 400);
    await action('Foreign user cannot confirm repair', 'student-confirm', owner.token, { isResolved: true, rating: 5 }, 403);
    await action('Resident confirms repair', 'student-confirm', resident.token, { isResolved: true, rating: 5, feedback: 'Tap works correctly' });
    await action('Manager closes completed report', 'manager-close', manager.token, { managerNotes: 'Work verified' });
    const final = (await state()).issueReports.find((i: any) => i.id === issue.id);
    record('Maintenance persisted with all sign-offs', final.staffCompleted && final.studentConfirmed && final.closedByManager);
  } catch (error) { record('Housing flow completion', false, String(error)); }
  // Small targeted adversarial probes after the normal journeys, to avoid contaminating them.
  if (store && product && buyer) {
    await check('Unrelated primary user cannot publish into seller store', 'POST', '/api/digital-market/products', buyer.token, { storeId: store.id, title: 'Unauthorized publication probe', price: 20, stockQuantity: 1 }, 403);
    const invalidProduct = await check('Reject nonnumeric product price and inventory', 'POST', '/api/digital-market/products', merchant.token, { storeId: store.id, title: 'Invalid numeric fields probe', price: 'not-a-number', stockQuantity: 'many' }, 400);
    if (invalidProduct.product) {
      const stored = (await state()).digitalMarketProducts.find((p: any) => p.id === invalidProduct.product.id);
      record('Nonnumeric catalog fields must not be stored', !stored, `Stored price=${stored?.price}; stock=${stored?.stockQuantity}`);
      const free = await raw('POST', '/api/digital-market/orders', buyer.token, { productId: stored.id, quantity: 1 });
      record('Malformed catalog entry must not become an order', free.status !== 201, `HTTP ${free.status}; total=${free.data.order?.totalAmount}`);
    }
    const negativeProduct = await check('Reject negative product price and inventory', 'POST', '/api/digital-market/products', merchant.token, { storeId: store.id, title: 'Negative fields probe', price: -5, stockQuantity: -2 }, 400);
    if (negativeProduct.product) {
      const stored = (await state()).digitalMarketProducts.find((p: any) => p.id === negativeProduct.product.id);
      record('Negative catalog fields must not be stored', !stored, `Stored price=${stored?.price}; stock=${stored?.stockQuantity}`);
    }
    await check('Signup rejects object email gracefully', 'POST', '/api/auth/register-unified', undefined, { name: 'Invalid type probe', email: {}, password: 'Journey-InvalidType-2026!' }, 400);
    await check('Login rejects object identifier gracefully', 'POST', '/api/auth/login', undefined, { usernameOrEmail: {}, password: 'Journey-InvalidType-2026!' }, 400);
    await check('Market registration rejects object student email gracefully', 'POST', '/api/digital-market/register', owner.token, { fullName: 'Invalid type probe', studentEmail: {}, password: 'Journey-NewMerchant-2026!', idNumber: 'JRN-2000' }, 400);
  }
  if (resident && hostel) {
    const forged = await raw('POST', '/api/issue-reports', owner.token, { title: 'Unauthorized housing report probe', hostelId: hostel.id, studentId: resident.id, studentEmail: resident.email, description: 'Primary account has no activated room' });
    record('Unallocated primary user cannot impersonate resident report', [400,403].includes(forged.status), `HTTP ${forged.status}; represented student accepted=${forged.data.studentId === resident.id}`);
  }
} catch (error) { record('Journey runner', false, String(error)); }
finally {
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; }
  await fs.writeFile('/tmp/pinevela-journey-results-20261003.json', JSON.stringify({ results, serverErrorChunks: serverErrors }, null, 2));
  await fs.rm(temp, { recursive: true, force: true });
  console.log(`RESULT ${results.filter(r => r.pass).length}/${results.length} checks passed; findings recorded in /tmp/pinevela-journey-results-20261003.json`);
}
