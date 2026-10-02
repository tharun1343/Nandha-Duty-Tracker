/* A tiny in-memory stand-in for Supabase used by the e2e test:
   email-code auth (/auth/v1) and the `records` table (/rest/v1) with the same
   newest-edit-wins + seq rules as supabase/schema.sql. */
const crypto = require('crypto');
function fakeSupabase() {
  const users = new Map(), tokens = new Map(), rows = new Map(); let seq = 0;
  const uidFor = email => { if (!users.has(email)) users.set(email, crypto.randomUUID()); return users.get(email); };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const put = (uid, r) => {
    const k = `${uid}/${r.kind}/${r.id}`; const old = rows.get(k);
    if (old && r.client_updated_at < old.client_updated_at) return;
    rows.set(k, { ...r, user_id: uid, seq: ++seq });
  };
  const state = { otpRequests: 0, failRest: false };
  async function handle(route) {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    const send = (status, body) => route.fulfill({ status, headers, body: body === undefined ? '' : JSON.stringify(body) });
    if (m === 'OPTIONS') return send(204);
    if (p === '/auth/v1/otp') { state.otpRequests++; return send(200, {}); }
    if (p === '/auth/v1/verify') {
      const b = JSON.parse(req.postData() || '{}');
      if (b.token === '000000') return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      const uid = uidFor(b.email); const now = Math.floor(Date.now() / 1000);
      const at = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, email: b.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 })}.sig`;
      tokens.set(at, uid);
      return send(200, { access_token: at, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'rt-' + uid, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: b.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
    }
    if (p === '/auth/v1/logout') return send(204);
    if (p === '/rest/v1/records') {
      const uid = tokens.get((req.headers().authorization || '').replace(/^Bearer /, ''));
      if (!uid) return send(401, { message: 'JWT expired' });
      if (state.failRest) return send(500, { message: 'boom' });
      if (m === 'POST') { const body = JSON.parse(req.postData() || '[]'); for (const r of [].concat(body)) if (r.user_id === uid) put(uid, r); return send(201); }
      if (m === 'GET') {
        const gt = Number((url.searchParams.get('seq') || 'gt.0').slice(3)); const lim = Number(url.searchParams.get('limit') || 1000);
        const out = [...rows.values()].filter(r => r.user_id === uid && r.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, lim).map(({ user_id, ...r }) => r);
        return send(200, out);
      }
    }
    return send(404, { message: 'not found ' + p });
  }
  return { handle, uidFor, put, rows, state, rowsFor: email => [...rows.values()].filter(r => r.user_id === uidFor(email)) };
}

/* Same sample data as the prototype, stored on the fake server as the account's rows. */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function seedAccount(srv, email, name) {
  const uid = srv.uidFor(email); const rows = []; const at = 1;
  const add = (kind, id, data) => rows.push({ kind, id, data, deleted: false, client_updated_at: at });
  [['c1', 'Villages', 'house'], ['c2', 'Towns', 'city'], ['c3', 'Bus stands & depots', 'busstop']].forEach(([id, n, icon]) => add('category', id, { id, name: n, icon }));
  const places = [['p1', 'Perundurai', 'c2'], ['p2', 'Erode', 'c2'], ['p3', 'Bhavani', 'c2'], ['p4', 'Gobichettipalayam', 'c2'], ['p5', 'Chennimalai', 'c1'], ['p6', 'Thingalur', 'c1'], ['p7', 'Vijayamangalam', 'c1'], ['p8', 'Kavindapadi', 'c1'], ['p9', 'Erode Central Bus Stand', 'c3'], ['p10', 'Perundurai Depot', 'c3']].map(([id, n, catId]) => ({ id, name: n, catId, icon: null, hidden: false }));
  places.forEach(p => add('place', p.id, p));
  add('field', 'fare', { id: 'fare', name: 'Bus Fare', on: true, order: 0 });
  add('field', 'para', { id: 'para', name: 'Paramount', on: false, order: 1 });
  add('profile', 'me', { name, avatar: 'bus', photo: null, staffId: '', depot: '', phone: '' });
  add('settings', 'me', { theme: 'system', palette: 'navy', text: 'm', bold: false, weeklyOff: 0, reminder: { on: false, time: '20:00' } });
  const t = iso(new Date()); const duties = ['8752', '8753', '8710', '8761', '8724', '8735']; const skip = new Set([3, 9, 16]);
  for (let ago = 75; ago >= 1; ago--) {
    const dd = parse(t); dd.setDate(dd.getDate() - ago); const d = iso(dd); const r = rng(parse(d).getTime() / 86400000);
    if (skip.has(ago)) continue;
    let status = dd.getDay() === 0 ? 'holiday' : 'duty'; if (status === 'duty' && r() < 0.06) status = 'leave';
    const e = { date: d, status, m: { no: '', place: null, text: '' }, e: { no: '', place: null, text: '' }, amt: {}, note: '', updatedAt: 1 };
    if (status === 'duty') {
      e.m = { no: duties[Math.floor(r() * 3)], place: places[Math.floor(r() * 8)].id, text: '' };
      if (r() < 0.88) e.e = { no: duties[3 + Math.floor(r() * 3)], place: places[Math.floor(r() * places.length)].id, text: '' };
      e.amt.fare = [60, 80, 90, 100, 120, 140][Math.floor(r() * 6)];
      if (r() < 0.12) e.note = 'Spare duty — covered for another route';
    }
    if (status === 'leave') e.note = 'Personal leave';
    add('entry', d, e);
  }
  rows.forEach(r => srv.put(uid, r));
  return uid;
}
module.exports = { fakeSupabase, seedAccount };
