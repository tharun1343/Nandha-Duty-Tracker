import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMeta, detect, run, pendingCount, collect } from '../../src/sync.js';

const T = Date.now() + 60_000; // edit times later than the real clock used for the first uploads

/* In-memory stand-in for the Supabase `records` table + its trigger:
   an update with an older client_updated_at is ignored; every write gets a new seq. */
function fakeServer() {
  const rows = new Map(); let seq = 0; let offline = false;
  return {
    rows, setOffline(v) { offline = v; },
    api: {
      async push(batch) {
        if (offline) throw new Error('offline');
        for (const r of batch) {
          const k = `${r.kind}/${r.id}`; const old = rows.get(k);
          if (old && r.client_updated_at < old.client_updated_at) continue;
          rows.set(k, { ...structuredClone(r), seq: ++seq });
        }
      },
      async pull(cursor, limit) {
        if (offline) throw new Error('offline');
        return [...rows.values()].filter(r => r.seq > cursor).sort((a, b) => a.seq - b.seq).slice(0, limit).map(r => structuredClone(r));
      }
    }
  };
}
const blank = () => ({
  entries: {}, places: [], categories: [{ id: 'c1', name: 'Villages', icon: 'house' }],
  fields: [{ id: 'fare', name: 'Bus Fare', on: true }, { id: 'para', name: 'Paramount', on: false }],
  profile: { name: '' }, settings: { theme: 'system', weeklyOff: 0 }
});
const entry = (date, no, fare, at = 1) => ({ date, status: 'duty', m: { no, place: null, text: '' }, e: { no: '', place: null, text: '' }, amt: { fare }, note: '', updatedAt: at });

test('first sync uploads everything, second device downloads it', async () => {
  const srv = fakeServer();
  const A = blank(), mA = newMeta();
  A.profile.name = 'Kumar'; A.entries['2026-10-01'] = entry('2026-10-01', '8752', 120);
  A.places.push({ id: 'p1', name: 'Erode', catId: 'c1' });
  await run(A, mA, srv.api);
  assert.equal(pendingCount(mA), 0);
  const B = blank(), mB = newMeta();
  const res = await run(B, mB, srv.api);
  assert.ok(res.changed);
  assert.equal(B.profile.name, 'Kumar');
  assert.equal(B.entries['2026-10-01'].m.no, '8752');
  assert.deepEqual(B.places.map(p => p.name), ['Erode']);
  assert.deepEqual(B.fields.map(f => f.id), ['fare', 'para']);
  assert.equal(pendingCount(mB), 0, 'downloaded rows are not re-uploaded');
});

test('offline edits queue up and upload after reconnect', async () => {
  const srv = fakeServer(); const A = blank(), m = newMeta();
  await run(A, m, srv.api);
  srv.setOffline(true);
  for (let d = 1; d <= 7; d++) { A.entries[`2026-10-0${d}`] = entry(`2026-10-0${d}`, '875' + d, 100); detect(A, m); }
  assert.equal(pendingCount(m), 7);
  await assert.rejects(run(A, m, srv.api));
  assert.equal(pendingCount(m), 7, 'nothing lost when the upload fails');
  srv.setOffline(false);
  await run(A, m, srv.api);
  assert.equal(pendingCount(m), 0);
  assert.equal([...srv.rows.keys()].filter(k => k.startsWith('entry/')).length, 7);
});

test('delete becomes a tombstone and removes the entry on the other phone', async () => {
  const srv = fakeServer(); const A = blank(), mA = newMeta(), B = blank(), mB = newMeta();
  A.entries['2026-10-05'] = entry('2026-10-05', '8752', 90);
  await run(A, mA, srv.api); await run(B, mB, srv.api);
  assert.ok(B.entries['2026-10-05']);
  delete A.entries['2026-10-05'];
  await run(A, mA, srv.api);
  assert.equal(srv.rows.get('entry/2026-10-05').deleted, true);
  await run(B, mB, srv.api);
  assert.equal(B.entries['2026-10-05'], undefined);
});

test('same day edited on two phones: newest edit wins, nothing silently lost', async () => {
  const srv = fakeServer(); const A = blank(), mA = newMeta(), B = blank(), mB = newMeta();
  A.entries['2026-10-05'] = entry('2026-10-05', '1000', 50);
  await run(A, mA, srv.api); await run(B, mB, srv.api);
  // Both edit offline; B edits later.
  A.entries['2026-10-05'] = entry('2026-10-05', '2000', 60); detect(A, mA, T + 5_000);
  B.entries['2026-10-05'] = entry('2026-10-05', '3000', 70); detect(B, mB, T + 9_000);
  await run(B, mB, srv.api); // newer edit reaches the server first
  await run(A, mA, srv.api); // older edit is rejected by the server and replaced locally
  assert.equal(srv.rows.get('entry/2026-10-05').data.m.no, '3000');
  assert.equal(A.entries['2026-10-05'].m.no, '3000');
  // And the other order: the newer edit arrives second and overwrites.
  A.entries['2026-10-06'] = entry('2026-10-06', '4000', 10); detect(A, mA, T + 20_000);
  B.entries['2026-10-06'] = entry('2026-10-06', '5000', 10); detect(B, mB, T + 30_000);
  await run(A, mA, srv.api); await run(B, mB, srv.api); await run(A, mA, srv.api);
  assert.equal(A.entries['2026-10-06'].m.no, '5000');
  assert.equal(B.entries['2026-10-06'].m.no, '5000');
});

test('phone used offline before its first sign-in keeps its newer entry; blank defaults do not overwrite the account', async () => {
  const srv = fakeServer(); const A = blank(), mA = newMeta(), B = blank(), mB = newMeta();
  B.profile.name = 'Kumar'; B.settings.weeklyOff = 1;
  B.entries['2026-10-07'] = entry('2026-10-07', '1111', 10, T + 1_000);
  B.entries['2026-10-08'] = entry('2026-10-08', '3333', 10, T + 1_000);
  await run(B, mB, srv.api);
  A.entries['2026-10-07'] = entry('2026-10-07', '2222', 20, T + 2_000); // newer, made offline on A
  A.entries['2026-10-08'] = entry('2026-10-08', '4444', 20, 5);          // older than the server copy
  await run(A, mA, srv.api);
  assert.equal(A.profile.name, 'Kumar');
  assert.equal(A.settings.weeklyOff, 1);
  assert.equal(A.entries['2026-10-08'].m.no, '3333');
  assert.equal(srv.rows.get('entry/2026-10-08').data.m.no, '3333');
  assert.equal(A.entries['2026-10-07'].m.no, '2222');
  assert.equal(srv.rows.get('entry/2026-10-07').data.m.no, '2222');
});

test('field order and settings round-trip', async () => {
  const srv = fakeServer(); const A = blank(), mA = newMeta(), B = blank(), mB = newMeta();
  A.fields = [{ id: 'para', name: 'Paramount', on: true }, { id: 'fare', name: 'Bus Fare', on: false }];
  A.settings.weeklyOff = 1;
  await run(A, mA, srv.api); await run(B, mB, srv.api);
  assert.deepEqual(B.fields.map(f => f.id), ['para', 'fare']);
  assert.equal(B.settings.weeklyOff, 1);
  assert.equal(detect(B, mB), 0, 'no phantom changes after a pull');
  assert.ok(collect(B).has('settings/me'));
});
