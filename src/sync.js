/*
 * Offline-first sync engine.
 *
 * The app state (S) is saved on the phone first. Every record the app keeps
 * (entries, places, categories, amount fields, profile, settings) becomes one
 * row on the server: { kind, id, data, deleted, client_updated_at, seq }.
 *
 * - detect(): compares the state with the last known snapshot and queues every
 *   changed or removed record (removals become tombstones: deleted = true).
 * - run(): pushes the queue, then pulls everything with seq > cursor.
 * - Newest edit wins: the server keeps the row with the larger client_updated_at
 *   (enforced by a trigger), and pulled rows never overwrite a newer local edit.
 *
 * Pure functions + an injected `api`, so it can be tested without a network.
 */

export const KINDS = ['entry', 'place', 'category', 'field', 'profile', 'settings'];

export function newMeta() {
  return { snap: {}, dirty: {}, cursor: 0, synced: false };
}

/** Map of "kind/id" → value for everything that syncs. */
export function collect(S) {
  const out = new Map();
  for (const e of Object.values(S.entries)) out.set(`entry/${e.date}`, e);
  for (const p of S.places) out.set(`place/${p.id}`, p);
  for (const c of S.categories) out.set(`category/${c.id}`, c);
  S.fields.forEach((f, i) => out.set(`field/${f.id}`, { ...f, order: i }));
  out.set('profile/me', S.profile);
  out.set('settings/me', S.settings);
  return out;
}

const splitKey = k => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

/** Writes one record into the state (value null = delete). */
export function applyRecord(S, key, value) {
  const [kind, id] = splitKey(key);
  const upsert = (list, v) => { const i = list.findIndex(x => x.id === id); if (v) { if (i >= 0) list[i] = v; else list.push(v); } else if (i >= 0) list.splice(i, 1); };
  switch (kind) {
    case 'entry': if (value) S.entries[id] = value; else delete S.entries[id]; break;
    case 'place': upsert(S.places, value); break;
    case 'category': upsert(S.categories, value); break;
    case 'field': {
      upsert(S.fields, value);
      S.fields.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      S.fields.forEach(f => { delete f.order; });
      break;
    }
    case 'profile': if (value) S.profile = { ...S.profile, ...value }; break;
    case 'settings': if (value) S.settings = { ...S.settings, ...value }; break;
    default: break;
  }
}

/** Queues changed/removed records. Returns how many were queued. */
export function detect(S, meta, now = Date.now()) {
  const cur = collect(S);
  let n = 0;
  for (const [k, v] of cur) {
    const j = JSON.stringify(v);
    if (meta.snap[k] !== j) { meta.snap[k] = j; meta.dirty[k] = Math.max(now, (meta.dirty[k] || 0) + 1); n++; }
  }
  for (const k of Object.keys(meta.snap)) {
    if (!cur.has(k)) { delete meta.snap[k]; meta.dirty[k] = Math.max(now, (meta.dirty[k] || 0) + 1); n++; }
  }
  return n;
}

export const pendingCount = meta => Object.keys(meta.dirty).length;

/** Rows to upload for the current queue. */
export function buildPush(S, meta) {
  const cur = collect(S);
  return Object.entries(meta.dirty).map(([k, at]) => {
    const [kind, id] = splitKey(k);
    const v = cur.get(k);
    return { kind, id, data: v === undefined ? null : v, deleted: v === undefined, client_updated_at: at };
  });
}

/** Clears queue items that were uploaded and not edited again meanwhile. */
export function markPushed(meta, rows) {
  for (const r of rows) {
    const k = `${r.kind}/${r.id}`;
    if (meta.dirty[k] === r.client_updated_at) delete meta.dirty[k];
  }
}

/** Applies downloaded rows; returns true when the visible state changed. */
export function applyPulled(S, meta, rows, first = false) {
  const touched = new Set();
  for (const r of rows) {
    if (r.seq > meta.cursor) meta.cursor = r.seq;
    if (!KINDS.includes(r.kind)) continue;
    const k = `${r.kind}/${r.id}`;
    const localAt = meta.dirty[k];
    if (localAt && localAt > r.client_updated_at) continue; // our edit is newer; it will be uploaded
    if (localAt) delete meta.dirty[k];
    if (first && r.kind === 'entry' && S.entries[r.id]) {
      // First sync: keep a day's entry edited on this phone later than the server copy.
      const serverAt = r.deleted ? r.client_updated_at : (r.data?.updatedAt ?? r.client_updated_at);
      if ((S.entries[r.id].updatedAt || 0) > serverAt) continue;
    }
    const value = r.deleted ? null : r.data;
    if ((meta.snap[k] ?? null) === (value === null ? null : JSON.stringify(value))) continue;
    applyRecord(S, k, value);
    touched.add(k);
  }
  if (!touched.size) return false;
  const cur = collect(S);
  for (const k of touched) { if (cur.has(k)) meta.snap[k] = JSON.stringify(cur.get(k)); else delete meta.snap[k]; }
  // Collecting can re-shape other records (e.g. field order); keep the snapshot in step for those too.
  for (const [k, v] of cur) if (k.startsWith('field/')) meta.snap[k] = JSON.stringify(v);
  return true;
}

/**
 * One sync round: push the queue, then pull new server rows.
 * api.push(rows) → resolves when stored; api.pull(cursor, limit) → rows ordered by seq.
 */
export async function run(S, meta, api, { batch = 200 } = {}) {
  let changed = false;
  if (!meta.synced) {
    // First sync of this account on this phone: download first so the blank
    // defaults on a new phone never overwrite the account's real data
    // (entries compare their own edit times). Local records the server
    // doesn't have, or newer local entries, are uploaded below.
    meta.dirty = {};
    meta.snap = {};
    changed = await pullAll(S, meta, api, true);
    meta.synced = true;
  }
  detect(S, meta);
  const rows = buildPush(S, meta);
  for (let i = 0; i < rows.length; i += batch) {
    const part = rows.slice(i, i + batch);
    await api.push(part);
    markPushed(meta, part);
  }
  if (await pullAll(S, meta, api)) changed = true;
  return { pushed: rows.length, changed };
}

async function pullAll(S, meta, api, first = false) {
  let changed = false;
  for (;;) {
    const got = await api.pull(meta.cursor, 500);
    if (applyPulled(S, meta, got, first)) changed = true;
    if (got.length < 500) return changed;
  }
}
