/* Daily Duty Tracker — the app. Ported from prototype/index.html (the approved spec). */
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/figtree/800.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';
import { ICONS } from './icons.js';
import { APP_VERSION, UPDATE_URL } from './config.js';
import * as cloud from './cloud.js';
import * as SYNC from './sync.js';
import * as native from './native.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WDL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const todayIso = () => iso(new Date());
const fmtD = s => { const d = parse(s); return `${pad(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()}`; };
const fmtDW = s => `${fmtD(s)} ${WD[parse(s).getDay()]}`;
const daysIn = (y, m) => new Date(y, m, 0).getDate();
const monthKey = s => s.slice(0, 7);
const monthLabel = k => { const [y, m] = k.split('-').map(Number); return `${MON[m - 1]} ${y}`; };
const groupIN = s => { const last3 = s.slice(-3), rest = s.slice(0, -3); return (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3; };
const inr = n => { n = Math.round((+n || 0) * 100) / 100; const [i, d] = Math.abs(n).toFixed(2).split('.'); return (n < 0 ? '-' : '') + '₹' + groupIN(i) + (d !== '00' ? '.' + d : ''); };
const ic = (name, sz = 24, cls = '') => ICONS[name] ? `<img class="i3d ${cls}" src="${ICONS[name]}" width="${sz}" height="${sz}" alt="">` : `<span class="letter" style="width:${sz}px;height:${sz}px">${esc((name || '?')[0].toUpperCase())}</span>`;
const letterOr = (icon, name, sz = 28) => icon ? ic(icon, sz) : `<span class="letter" style="width:${sz}px;height:${sz}px">${esc((name || '?').trim()[0]?.toUpperCase() || '?')}</span>`;
const plural = (n, w, pw) => `${n} ${n === 1 ? w : (pw || w + 's')}`;
const STATUS = { duty: { label: 'On duty', icon: 'bus' }, holiday: { label: 'Holiday', icon: 'beach' }, leave: { label: 'Leave', icon: 'palm' } };

/* ---------------- Storage: one copy per account on this phone ("local" before sign-in) ---------------- */
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
function freshState() {
  return {
    v: 2,
    auth: { email: '' },
    profile: { name: '', avatar: 'bus', photo: null, staffId: '', depot: '', phone: '' },
    settings: { theme: 'system', palette: 'navy', text: 'm', bold: false, weeklyOff: 0, reminder: { on: false, time: '20:00' } },
    categories: [
      { id: 'c1', name: 'Villages', icon: 'house' },
      { id: 'c2', name: 'Towns', icon: 'city' },
      { id: 'c3', name: 'Bus stands & depots', icon: 'busstop' }
    ],
    places: [],
    fields: [
      { id: 'fare', name: 'Bus Fare', on: true },
      { id: 'para', name: 'Paramount', on: false }
    ],
    entries: {},
    sync: { pending: 0, last: 0, syncing: false, error: '' },
    openSecs: {}
  };
}
function migrate(s) {
  const f = freshState();
  s = { ...f, ...s };
  s.settings = { ...f.settings, ...s.settings, reminder: { ...f.settings.reminder, ...(s.settings && s.settings.reminder) } };
  s.profile = { ...f.profile, ...s.profile };
  s.sync = { ...f.sync, ...s.sync, syncing: false };
  s.v = 2;
  return s;
}
let UID = 'local', S = freshState(), META = SYNC.newMeta();
function loadAccount(uid) {
  UID = uid;
  let data = LS.get('ddt:data:' + uid), meta = LS.get('ddt:meta:' + uid);
  if (!data && uid !== 'local') {
    // First sign-in on this phone: keep anything entered before signing in.
    const local = LS.get('ddt:data:local');
    if (local) { data = local; meta = null; LS.del('ddt:data:local'); LS.del('ddt:meta:local'); }
  }
  S = migrate(data || freshState());
  META = meta || SYNC.newMeta();
  LS.set('ddt:account', uid);
  save();
}
let storageWarned = false;
function save() {
  SYNC.detect(S, META);
  S.sync.pending = SYNC.pendingCount(META);
  const ok = LS.set('ddt:data:' + UID, S) && LS.set('ddt:meta:' + UID, META);
  if (!ok && !storageWarned) { storageWarned = true; toast('Phone storage is full. Free some space so entries keep saving.', 'err'); }
}

/* ---------------- Derived helpers ---------------- */
const placeById = id => S.places.find(p => p.id === id);
const placeName = x => x.place ? (placeById(x.place)?.name || 'Unknown place') : (x.text || '');
const enabledFields = () => S.fields.filter(f => f.on);
const entryTotal = e => enabledFields().reduce((s, f) => s + (+e.amt?.[f.id] || 0), 0);
const isOff = s => parse(s).getDay() === S.settings.weeklyOff;
function totalsFor(dates) {
  const t = { duty: 0, holiday: 0, leave: 0, m: 0, e: 0, entries: 0, amt: {} };
  S.fields.forEach(f => t.amt[f.id] = 0);
  dates.forEach(d => { const e = S.entries[d]; if (!e) return; t.entries++; t[e.status]++; if (e.status === 'duty') { if (e.m.no) t.m++; if (e.e.no) t.e++; } for (const k in e.amt) t.amt[k] = (t.amt[k] || 0) + (+e.amt[k] || 0); });
  return t;
}
const rangeDates = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const monthDates = k => { const [y, m] = k.split('-').map(Number); return rangeDates(`${k}-01`, `${k}-${pad(daysIn(y, m))}`); };
function missingDays() {
  const t = todayIso(); const out = [];
  for (let i = 1; i <= 31; i++) { const d = addDays(t, -i); if (!S.entries[d] && !isOff(d)) out.push(d); }
  return out;
}
function placeUsage() { const u = {}; Object.values(S.entries).forEach(e => ['m', 'e'].forEach(s => { if (e[s].place) u[e[s].place] = (u[e[s].place] || 0) + 1; })); return u; }
function recentPlaces(n = 3) {
  const seen = []; Object.values(S.entries).sort((a, b) => b.date.localeCompare(a.date)).some(e => { ['m', 'e'].forEach(s => { const p = e[s].place; if (p && !seen.includes(p) && placeById(p) && !placeById(p).hidden) seen.push(p); }); return seen.length >= n; });
  return seen.slice(0, n);
}
function recentDuty(shift, n = 4) {
  const c = {}; Object.values(S.entries).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).forEach(e => { const no = e[shift].no; if (no) c[no] = (c[no] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
}
const lastDuty = () => Object.values(S.entries).filter(e => e.status === 'duty').sort((a, b) => b.date.localeCompare(a.date))[0];

/* ---------------- Appearance ---------------- */
function applyLook() {
  const st = S.settings;
  if (st.theme === 'system') app.removeAttribute('data-mode'); else app.dataset.mode = st.theme;
  app.dataset.palette = st.palette;
  document.documentElement.style.fontSize = ({ s: '14px', m: '16px', l: '18px' })[st.text];
  app.classList.toggle('bold', !!st.bold);
  const dark = st.theme === 'dark' || st.theme === 'darkblue' || (st.theme === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  native.setStatusBar(dark, getComputedStyle(app).getPropertyValue('--bg').trim() || (dark ? '#000000' : '#EDF1F6'));
}
function fillIcons(root = document) { $$('[data-ic]', root).forEach(el => { el.outerHTML = ic(el.dataset.ic, +el.dataset.sz || 24); }); }

/* ---------------- Sync (see sync.js) ---------------- */
const isOnline = () => navigator.onLine !== false;
let syncTimer, syncRunning = null, syncAgain = false, remTimer;
function markDirty() {
  save(); scheduleSync();
  clearTimeout(remTimer); remTimer = setTimeout(refreshReminders, 1500);
}
const canSync = () => cloud.configured && UID !== 'local';
function scheduleSync(delay = 1200) {
  clearTimeout(syncTimer); updateSync();
  if (!canSync() || !isOnline()) return;
  syncTimer = setTimeout(runSync, delay);
}
function runSync() {
  if (!canSync() || !isOnline()) { updateSync(); return Promise.resolve(); }
  if (syncRunning) { syncAgain = true; return syncRunning; }
  S.sync.syncing = true; updateSync();
  syncRunning = (async () => {
    try {
      const res = await SYNC.run(S, META, cloud.api);
      S.sync.last = Date.now(); S.sync.error = '';
      if (res.changed && !$('#main').hidden) { applyLook(); renderAll(); refreshReminders(); }
    } catch (e) {
      S.sync.error = e.code === 'offline' ? '' : (e.code === 'auth' ? 'auth' : 'server');
      if (e.code !== 'offline') console.warn('Sync failed', e);
    } finally {
      syncRunning = null; S.sync.syncing = false; save(); updateSync();
      if (syncAgain) { syncAgain = false; scheduleSync(300); }
    }
  })();
  return syncRunning;
}
function syncState() {
  if (!cloud.configured) return { cls: 'wait', text: 'Phone only' };
  if (!isOnline()) return { cls: 'bad', text: S.sync.pending ? `Offline · ${S.sync.pending} waiting` : 'Offline' };
  if (S.sync.error === 'auth') return { cls: 'bad', text: 'Sign in again' };
  if (S.sync.error) return { cls: 'bad', text: 'Sync failed' };
  if (S.sync.syncing) return { cls: 'wait', text: 'Syncing…' };
  if (S.sync.pending) return { cls: 'wait', text: `${S.sync.pending} waiting` };
  return { cls: 'ok', text: 'Synced' };
}
const ago = ts => { const s = Math.round((Date.now() - ts) / 1000); if (s < 45) return 'just now'; const m = Math.round(s / 60); if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`; return fmtD(iso(new Date(ts))); };
function updateSync() {
  const st = syncState(); const dot = $('#syncdot'); if (!dot) return;
  dot.className = 'dot ' + st.cls; $('#synctext').textContent = st.text;
  $$('.sync-live').forEach(b => { b.innerHTML = syncDetail(); });
}
function syncDetail() {
  const st = syncState();
  const sub = !cloud.configured ? 'Cloud backup is not set up in this build yet. Entries are saved on this phone.'
    : S.sync.error === 'auth' ? 'Your sign-in expired. Sign in again to keep syncing; entries on this phone are kept.'
    : `${S.sync.last ? 'Last synced ' + ago(S.sync.last) : 'Not synced yet'} · ${plural(S.sync.pending, 'change')} waiting to upload`;
  return `<div class="setrow"><span class="dot ${st.cls}"></span><div class="lbl"><div>${esc(st.text)}<small>${esc(sub)}</small></div></div></div>`;
}
window.addEventListener('online', () => { updateSync(); if (canSync() && S.sync.pending) toast('Back online — syncing your changes', 'info'); scheduleSync(300); });
window.addEventListener('offline', () => { updateSync(); if (!$('#main').hidden) toast('You are offline. Entries are saved on this phone.', 'warn'); });

/* ---------------- Toasts ---------------- */
let toastTimer;
function toast(msg, kind = 'ok', undo) {
  const box = $('#toasts'); box.innerHTML = '';
  const el = document.createElement('div'); el.className = 'toast t-' + kind; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ti">${({ ok: '✓', warn: '!', err: '!', info: 'i' })[kind]}</span><span class="tm">${esc(msg)}</span>${undo ? '<button class="undo">Undo</button>' : ''}<button class="x" aria-label="Dismiss">×</button>`;
  box.append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => { el.remove(); if (!box.children.length) app.classList.remove('toast-up'); }, 220); };
  el.querySelector('.x').onclick = close;
  if (undo) el.querySelector('.undo').onclick = () => { close(); undo(); };
  app.style.setProperty('--toast-h', el.offsetHeight + 'px'); app.classList.add('toast-up');
  clearTimeout(toastTimer); toastTimer = setTimeout(close, undo ? 6500 : 3800);
}

/* ---------------- Layers (sheets, dialogs, pickers) ---------------- */
const layers = [];
let ignorePop = 0;
function openLayer(html, { cls = 'sheet', onClose, onMount } = {}) {
  const el = document.createElement('div'); el.className = 'layer ' + cls;
  el.innerHTML = `<div class="scrim" data-act="close"></div>${html}`;
  $('#layers').append(el); fillIcons(el);
  const L = { el, onClose }; layers.push(L);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  app.classList.add('sheet-open');
  if (!native.isNative) { try { history.pushState({ layer: layers.length }, ''); } catch (e) {} }
  if (cls.includes('sheet')) enableSwipe(el);
  onMount && onMount(el);
  return el;
}
function closeTop(fromPop) {
  const L = layers.pop(); if (!L) return false;
  L.el.classList.remove('open'); setTimeout(() => L.el.remove(), 320);
  if (!layers.length) app.classList.remove('sheet-open');
  L.onClose && L.onClose();
  if (!fromPop && !native.isNative) { ignorePop++; try { history.back(); } catch (e) { ignorePop--; } }
  return true;
}
function enableSwipe(el) {
  const card = el.querySelector('.sheet-card'); if (!card) return;
  const handles = [card.querySelector('.grab'), card.querySelector('.sheet-head')].filter(Boolean);
  let y0 = null, dy = 0;
  handles.forEach(h => {
    h.addEventListener('touchstart', e => { if (e.target.closest('button')) return; y0 = e.touches[0].clientY; dy = 0; card.classList.add('dragging'); }, { passive: true });
    h.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); card.style.transform = `translateY(${dy}px)`; }, { passive: true });
    h.addEventListener('touchend', () => { if (y0 === null) return; card.classList.remove('dragging'); card.style.transform = ''; y0 = null; if (dy > 90) { const i = layers.findIndex(l => l.el === el); if (i === layers.length - 1) closeTop(); } });
  });
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  if (layers.length) { closeTop(true); return; }
  if (cur !== 'home') { showTab('home', true); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('.pop')) { $('.pop').remove(); return; } if (layers.length) closeTop(); } });
const sheetHead = (title, extra = '') => `<div class="grab"></div><div class="sheet-head"><h2>${title}</h2>${extra}<button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>`;

function confirmDlg({ icon = 'warning', title, text = '', kv = [], ok = 'Confirm', danger = false, onOk, cancel = 'Cancel' }) {
  openLayer(`<div class="dlg" role="dialog" aria-modal="true">${ic(icon, 44)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}<div class="foot-row"><button class="btn ghost" data-act="close">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" id="dlg-ok">${esc(ok)}</button></div></div>`,
    { cls: 'dialog', onMount: el => { el.querySelector('#dlg-ok').onclick = () => { closeTop(); onOk && onOk(); }; } });
}

/* Generic custom dropdown (bottom-sheet picker with search + groups + icons) */
function openPicker({ title, groups, value, search = true, extra = [], onPick, placeholder = 'Search' }) {
  const el = openLayer(`<div class="sheet-card" style="height:78%">${sheetHead(esc(title))}${search ? `<div class="pk-search"><div class="searchbox">${ic('pin', 20)}<input id="pk-q" placeholder="${esc(placeholder)}" autocomplete="off" maxlength="40"></div></div>` : ''}<div class="pk-list" role="listbox"></div></div>`);
  const list = el.querySelector('.pk-list');
  const draw = q => {
    q = (q || '').trim().toLowerCase(); let html = ''; let n = 0;
    groups.forEach(g => {
      const items = g.items.filter(i => !q || i.label.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q));
      if (!items.length) return;
      html += `<div class="pk-group">${g.icon ? ic(g.icon, 18) : ''}${esc(g.label)}</div>`;
      items.forEach(i => { n++; html += `<button class="pk-item ${i.value === value ? 'sel' : ''}" data-v="${esc(i.value)}" role="option" style="animation-delay:${Math.min(n, 12) * 18}ms">${i.iconHtml || (i.icon ? ic(i.icon, 30) : letterOr(null, i.label, 30))}<span class="t">${esc(i.label)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>${i.value === value ? '<span class="ck">✓</span>' : ''}</button>`; });
    });
    if (!n && q) html += `<div class="empty-state">${ic('map', 48)}<p>No match for “${esc(q)}”.</p></div>`;
    extra.forEach(i => { html += `<button class="pk-item other" data-v="${esc(i.value)}">${ic(i.icon, 30)}<span class="t">${esc(i.label)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span></button>`; });
    list.innerHTML = html;
  };
  draw('');
  list.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; const q = el.querySelector('#pk-q')?.value || ''; closeTop(); onPick(b.dataset.v, q); });
  const qi = el.querySelector('#pk-q'); if (qi) qi.addEventListener('input', () => draw(qi.value));
}

/* Calendar date picker */
function openCalendar({ value, onPick, title = 'Pick a date', max }) {
  let view = monthKey(value || todayIso());
  const el = openLayer(`<div class="sheet-card">${sheetHead(esc(title))}<div class="cal-head"><button class="iconbtn" id="cal-p" aria-label="Previous month">‹</button><b id="cal-t"></b><button class="iconbtn" id="cal-n" aria-label="Next month">›</button></div><div class="cal" id="cal-g"></div><div class="cal-legend"><span><i style="background:var(--duty-fg)"></i>On duty</span><span><i style="background:var(--hol-fg)"></i>Holiday</span><span><i style="background:var(--leave-fg)"></i>Leave</span></div><div class="sheet-foot"><button class="btn soft block" id="cal-today">Today · ${esc(fmtDW(todayIso()))}</button></div></div>`);
  const draw = () => {
    const [y, m] = view.split('-').map(Number); el.querySelector('#cal-t').textContent = `${MONL[m - 1]} ${y}`;
    const first = new Date(y, m - 1, 1).getDay(); let h = WD.map(w => `<div class="wd">${w[0]}${w[1]}</div>`).join('');
    for (let i = 0; i < first; i++) h += '<span></span>';
    for (let d = 1; d <= daysIn(y, m); d++) {
      const s = `${view}-${pad(d)}`; const e = S.entries[s]; const dis = max && s > max;
      h += `<button class="cd ${parse(s).getDay() === 0 ? 'sun' : ''} ${s === todayIso() ? 'today' : ''} ${s === value ? 'sel' : ''}" data-d="${s}" ${dis ? 'disabled style="opacity:.3"' : ''}>${d}${e ? `<i class="${e.status}"></i>` : ''}</button>`;
    }
    el.querySelector('#cal-g').innerHTML = h;
  };
  const shift = n => { const [y, m] = view.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); view = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; draw(); };
  el.querySelector('#cal-p').onclick = () => shift(-1); el.querySelector('#cal-n').onclick = () => shift(1);
  el.querySelector('#cal-g').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b || b.disabled) return; closeTop(); onPick(b.dataset.d); });
  el.querySelector('#cal-today').onclick = () => { closeTop(); onPick(todayIso()); };
  draw();
}

/* Info popover */
function showInfo(btn, text) {
  $('.pop')?.remove();
  const p = document.createElement('div'); p.className = 'pop'; p.textContent = text; app.append(p);
  const r = btn.getBoundingClientRect(), a = app.getBoundingClientRect();
  let left = Math.min(Math.max(8, r.left - a.left - 120), a.width - p.offsetWidth - 8);
  p.style.left = left + 'px'; p.style.top = (r.bottom - a.top + 8) + 'px';
  setTimeout(() => document.addEventListener('click', function h(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', h, true); } }, true));
}

/* ---------------- Navigation ---------------- */
let cur = 'home';
const TITLES = { records: 'Records', export: 'Export', settings: 'Settings' };
function showTab(t, fromPop) {
  const prev = cur; cur = t;
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + t));
  $('#fab').hidden = !(t === 'home' || t === 'records');
  renderTop();
  if (!fromPop && !native.isNative) { try { if (prev === 'home' && t !== 'home') history.pushState({ tab: t }, ''); else if (prev !== 'home' && t === 'home') { ignorePop++; history.back(); } } catch (e) {} }
  $('.pop')?.remove();
}
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function avatarHtml(sz = 40) { return S.profile.photo ? `<img class="photo" src="${S.profile.photo}" alt="">` : ic(S.profile.avatar || 'bus', Math.round(sz * .72)); }
function renderTop() {
  $('#top-avatar').innerHTML = avatarHtml();
  if (cur === 'home') { $('#top-t1').textContent = greeting(); $('#top-t2').textContent = S.profile.name || 'Welcome'; }
  else { $('#top-t1').textContent = fmtDW(todayIso()); $('#top-t2').textContent = TITLES[cur]; }
  updateSync();
}

/* ---------------- Home ---------------- */
function shiftTicket(label, icon, x) {
  if (!x.no && !placeName(x)) return `<div class="ticket"><span class="k">${ic(icon, 16)}${label}</span><span class="no muted">—</span><span class="pl">No duty</span></div>`;
  return `<div class="ticket"><span class="k">${ic(icon, 16)}${label}</span><span class="no">${esc(x.no || '—')}</span><span class="pl">${esc(placeName(x) || 'No place')}</span></div>`;
}
function renderHome() {
  const t = todayIso(), e = S.entries[t], mk = monthKey(t);
  const tot = totalsFor(monthDates(mk)); const flds = enabledFields();
  let today = `<div class="today"><div class="d1">Today</div><div class="d2">${esc(fmtDW(t))}</div>`;
  if (!e) {
    const off = isOff(t); const ld = lastDuty();
    today += `<div class="empty">${ic(off ? 'beach' : 'bus', 58)}<p>${off ? `It's your weekly off (${WDL[S.settings.weeklyOff]}). Mark it as a holiday, or add a duty if you worked.` : 'No entry for today yet. Add the duty numbers and fare when you finish.'}</p></div>
      <div class="actions"><button class="btn primary" data-act="addFor" data-date="${t}">${ic('pencil', 20)}Add today's entry</button></div>
      <div class="actions" style="margin-top:8px">${!off && ld ? `<button class="btn soft sm" data-act="repeatLast">↻ Repeat last duty</button>` : ''}<button class="btn ghost sm" data-act="quick" data-status="holiday">${ic('beach', 18)}Holiday</button><button class="btn ghost sm" data-act="quick" data-status="leave">${ic('palm', 18)}Leave</button></div>`;
  } else if (e.status !== 'duty') {
    today += `<div class="empty">${ic(STATUS[e.status].icon, 58)}<p>Marked as <b>${STATUS[e.status].label.toLowerCase()}</b>${e.note ? ` · ${esc(e.note)}` : ''}.</p></div><div class="actions"><button class="btn ghost" data-act="editEntry" data-date="${t}">${ic('pencil', 20)}Edit entry</button></div>`;
  } else {
    today += `<div class="shifts">${shiftTicket('Morning', 'sunrise', e.m)}${shiftTicket('Evening', 'sunset', e.e)}</div>
      ${flds.map(f => `<div class="amtline"><span class="muted small">${esc(f.name)}</span><b class="num">${e.amt[f.id] ? inr(e.amt[f.id]) : '—'}</b></div>`).join('')}
      <div class="actions"><button class="btn ghost" data-act="editEntry" data-date="${t}">${ic('pencil', 20)}Edit entry</button></div>`;
  }
  today += '</div>';

  const miss = missingDays();
  const missHtml = miss.length ? `<div class="alert"><div class="ah">${ic('warning', 34)}<div class="grow"><b>${plural(miss.length, 'day')} without an entry</b><span class="muted small">Past duty days in the last 31 days</span></div></div><div class="chips">${miss.slice(0, 6).map(d => `<button class="chip" data-act="addFor" data-date="${d}">${esc(fmtDW(d).slice(0, 6))} ${WD[parse(d).getDay()]}</button>`).join('')}${miss.length > 6 ? `<button class="chip" data-act="openMissing">+${miss.length - 6} more</button>` : ''}</div></div>` : '';

  const amtTiles = flds.map(f => `<div class="stat wide">${ic('money', 36)}<div class="grow"><div class="v num">${inr(tot.amt[f.id])}</div><div class="l">Total ${esc(f.name)} · ${MONL[+mk.slice(5) - 1]}</div></div><button class="btn soft sm" data-act="tab" data-tab="records">View</button></div>`).join('');

  const recent = Object.values(S.entries).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentHtml = recent.length ? `<div class="list">${recent.map(r => `<button class="li" data-act="editEntry" data-date="${r.date}">${ic(STATUS[r.status].icon, 30)}<div class="grow"><div class="t">${esc(fmtDW(r.date))}</div><div class="s">${r.status === 'duty' ? esc([r.m.no && `M ${r.m.no}`, r.e.no && `E ${r.e.no}`].filter(Boolean).join(' · ') || 'Amount only') : STATUS[r.status].label}</div></div><span class="num" style="font-weight:800">${r.status === 'duty' && entryTotal(r) ? inr(entryTotal(r)) : ''}</span><span class="chev">›</span></button>`).join('')}</div>`
    : `<div class="card empty-state">${ic('inbox', 56)}<p>No entries yet. Add your first duty to see it here.</p><button class="btn primary" data-act="fab">Add entry</button></div>`;

  $('#v-home').innerHTML = `${updateBanner()}${today}${missHtml}
    <div class="h-sec"><h3>${MONL[+mk.slice(5) - 1]} ${mk.slice(0, 4)} so far</h3><button class="info" data-act="info" data-info="Same totals as the bottom row of your Excel sheet: on-duty days, morning and evening duty counts, and the amount total for this month.">i</button></div>
    <div class="stats">
      <div class="stat">${ic('bus', 34)}<div><div class="v num">${tot.duty}</div><div class="l">On-duty days</div></div></div>
      <div class="stat">${ic('beach', 34)}<div><div class="v num">${tot.holiday + tot.leave}</div><div class="l">Holiday / leave</div></div></div>
      <div class="stat">${ic('sunrise', 34)}<div><div class="v num">${tot.m}</div><div class="l">Morning duties</div></div></div>
      <div class="stat">${ic('sunset', 34)}<div><div class="v num">${tot.e}</div><div class="l">Evening duties</div></div></div>
      ${amtTiles}
    </div>
    <div class="h-sec"><h3>Recent entries</h3><button class="linkbtn" data-act="tab" data-tab="records">See all</button></div>
    ${recentHtml}`;
}

/* ---------------- Records ---------------- */
const R = { month: monthKey(todayIso()), filter: 'all', q: '' };
function dayMatches(d, e) {
  const f = R.filter, past = d <= todayIso();
  if (f === 'duty' || f === 'holiday' || f === 'leave') { if (!e || e.status !== f) return false; }
  if (f === 'missing' && (e || !past || d === todayIso() || isOff(d))) return false;
  if (R.q) { if (!e) return false; const q = R.q.toLowerCase(); const hay = [e.m.no, e.e.no, placeName(e.m), placeName(e.e), e.note, STATUS[e.status].label].join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
  return true;
}
function renderRecords() {
  const dates = monthDates(R.month); const t = todayIso(); const flds = enabledFields();
  const tot = totalsFor(dates);
  const cnt = { all: dates.length, duty: tot.duty, holiday: tot.holiday, leave: tot.leave, missing: dates.filter(d => !S.entries[d] && d < t && !isOff(d)).length };
  const rows = dates.filter(d => dayMatches(d, S.entries[d]));
  const rowHtml = rows.map(d => {
    const e = S.entries[d], dt = parse(d), fut = d > t, off = isOff(d);
    let cls = 'day', body;
    if (e) {
      cls += ' s-' + e.status;
      const tg = `<span class="tag ${e.status}">${ic(STATUS[e.status].icon, 14)}${STATUS[e.status].label}</span>`;
      if (e.status === 'duty') {
        const ln = (icn, x) => (x.no || placeName(x)) ? `<div class="dl">${ic(icn, 16)}<span class="mono">${esc(x.no || '—')}</span><span class="pl">${esc(placeName(x))}</span></div>` : '';
        body = `<div class="dl">${tg}${e.note ? ic('memo', 15) : ''}</div>${ln('sunrise', e.m)}${ln('sunset', e.e)}`;
      } else body = `<div class="dl">${tg}</div>${e.note ? `<div class="dl"><span class="pl">${esc(e.note)}</span></div>` : ''}`;
    } else if (fut) { cls += ' future'; body = `<div class="dl muted">${off ? 'Weekly off' : 'Upcoming'}</div>`; }
    else if (off) { cls += ' offempty'; body = `<div class="dl"><span class="tag off">Weekly off · not marked</span></div>`; }
    else if (d === t) { body = `<div class="dl"><span class="tag duty">Today</span><span class="muted">Tap to add</span></div>`; }
    else { cls += ' miss'; body = `<div class="dl"><span class="tag miss">${ic('warning', 14)}No entry</span><span class="muted small">Tap to add</span></div>`; }
    if (d === t) cls += ' today-row';
    const amt = e && e.status === 'duty' && entryTotal(e) ? `<div class="damt">${inr(entryTotal(e))}${flds.length > 1 ? '<small>total</small>' : ''}</div>` : '';
    return `<button class="${cls}" data-act="addFor" data-date="${d}"><div class="dbadge"><b>${pad(dt.getDate())}</b><span>${WD[dt.getDay()]}</span></div><div class="dmain">${body}</div>${amt}</button>`;
  }).join('');
  const F = [['all', 'All'], ['duty', 'On duty'], ['holiday', 'Holiday'], ['leave', 'Leave'], ['missing', 'No entry']];
  $('#v-records').innerHTML = `
    <div class="monthbar"><button class="iconbtn" data-act="mPrev" aria-label="Previous month">‹</button><button class="mname" data-act="mPick">${ic('calendar', 22)}${MONL[+R.month.slice(5) - 1]} ${R.month.slice(0, 4)} <span class="muted">▾</span></button><button class="iconbtn" data-act="mNext" aria-label="Next month">›</button></div>
    <div class="searchbox">${ic('pin', 20)}<input id="rec-q" placeholder="Search duty no., place or note" value="${esc(R.q)}" maxlength="40" autocomplete="off">${R.q ? '<button class="iconbtn" data-act="clearQ" aria-label="Clear search">✕</button>' : ''}</div>
    <div class="chips scroll">${F.map(([k, l]) => `<button class="chip ${R.filter === k ? 'on' : ''}" data-act="rFilter" data-f="${k}">${l} <span class="n">${cnt[k]}</span></button>`).join('')}</div>
    <div class="days">${rowHtml || `<div class="card empty-state">${ic('clipboard', 56)}<p>${R.q ? `Nothing matches “${esc(R.q)}” in ${monthLabel(R.month)}.` : `No ${F.find(f => f[0] === R.filter)[1].toLowerCase()} days in ${monthLabel(R.month)}.`}</p><button class="btn ghost sm" data-act="resetRec">Show all days</button></div>`}</div>
    <div class="totals"><div class="in glass">
      <div><span>On duty</span><b>${tot.duty}</b></div><div><span>Morning</span><b>${tot.m}</b></div><div><span>Evening</span><b>${tot.e}</b></div><div><span>${esc(flds[0]?.name || 'Amount')}</span><b>${inr(tot.amt[flds[0]?.id] || 0)}</b></div>
      ${flds.length > 1 ? `<div class="amt-extra">${flds.slice(1).map(f => `<span>${esc(f.name)}: <b>${inr(tot.amt[f.id])}</b></span>`).join('')}</div>` : ''}
    </div></div>`;
  const q = $('#rec-q'); q.addEventListener('input', () => { R.q = q.value; const pos = q.selectionStart; renderRecords(); const n = $('#rec-q'); n.focus(); n.setSelectionRange(pos, pos); });
}
function monthOptions() {
  const keys = new Set(Object.keys(S.entries).map(monthKey)); const t = todayIso();
  for (let i = -1; i <= 13; i++) { const d = parse(t); d.setDate(1); d.setMonth(d.getMonth() - i); keys.add(iso(d).slice(0, 7)); }
  const byYear = {}; [...keys].sort().reverse().forEach(k => (byYear[k.slice(0, 4)] = byYear[k.slice(0, 4)] || []).push(k));
  return Object.keys(byYear).sort().reverse().map(y => ({ label: y, icon: 'calendar', items: byYear[y].map(k => { const n = Object.keys(S.entries).filter(d => d.startsWith(k)).length; return { value: k, label: MONL[+k.slice(5) - 1] + ' ' + y, sub: n ? plural(n, 'entry', 'entries') : 'No entries', icon: 'tearcal' }; }) }));
}

/* ---------------- Entry sheet (add / edit) ---------------- */
let F = null;
const blankShift = () => ({ no: '', place: null, text: '', other: false, save: true });
function defaultStatus(d) { return isOff(d) ? 'holiday' : 'duty'; }
function openEntry(date, prefill) {
  const ex = S.entries[date];
  if (ex && !prefill) {
    F = { mode: 'edit', orig: date, date, status: ex.status, m: { ...blankShift(), ...clone(ex.m) }, e: { ...blankShift(), ...clone(ex.e) }, amt: {}, note: ex.note || '' };
    for (const k in ex.amt) F.amt[k] = String(ex.amt[k]);
  } else {
    F = { mode: 'add', orig: null, date, status: defaultStatus(date), m: blankShift(), e: blankShift(), amt: {}, note: '' };
    if (prefill) Object.assign(F, prefill);
  }
  F.errs = {};
  openLayer(`<div class="sheet-card" style="height:92%">${sheetHead(F.mode === 'add' ? 'Add entry' : 'Edit entry', F.mode === 'edit' ? `<button class="iconbtn" data-act="delEntry" aria-label="Delete entry" style="color:var(--danger)">🗑</button>` : '')}<div class="sheet-body" id="ef"></div><div class="sheet-foot"><div class="summary" id="ef-sum" hidden></div><button class="btn primary block" data-act="saveEntry">${F.mode === 'add' ? 'Add entry' : 'Update entry'}</button></div></div>`,
    { onClose: () => { F = null; } });
  drawEntry();
}
function moneyStr(v) { if (v === '' || v == null) return ''; const [i, d] = String(v).split('.'); return groupIN(i || '0') + (d !== undefined ? '.' + d : ''); }
function shiftHtml(s, label, icon) {
  const x = F[s]; const err = F.errs;
  const plVal = x.other ? 'Other' : (x.place ? placeById(x.place)?.name : '');
  const rec = recentDuty(s);
  return `<div class="shift" id="shift-${s}"><div class="shift-h">${ic(icon, 24)}<span class="grow">${label}</span>${(x.no || x.place || x.other) ? `<button class="linkbtn small" data-act="clearShift" data-s="${s}">Clear</button>` : ''}</div>
    <div class="grid2">
      <div class="field ${err[s + '.no'] ? 'err' : ''}" data-k="${s}.no"><label for="no-${s}">Duty no.</label><div class="input mono"><input id="no-${s}" data-bind="${s}.no" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="e.g. 8752" value="${esc(x.no)}" autocomplete="off"></div><div class="msg">${esc(err[s + '.no'] || '')}</div></div>
      <div class="field" data-k="${s}.place"><label>Place</label><button class="input" data-act="pickPlace" data-s="${s}">${ic('pin', 18)}<span class="val ${plVal ? '' : 'ph'}">${esc(plVal || 'Select')}</span><span class="caret">▾</span></button></div>
    </div>
    ${x.other ? `<div class="field ${err[s + '.text'] ? 'err' : ''}" data-k="${s}.text"><label for="tx-${s}">Place name <span class="req">*</span></label><div class="input"><input id="tx-${s}" data-bind="${s}.text" maxlength="40" placeholder="Type the place name" value="${esc(x.text)}" autocomplete="off"></div><div class="msg">${esc(err[s + '.text'] || '')}</div>
      <button class="checkrow" data-act="toggleSave" data-s="${s}"><span class="checkbox ${x.save ? 'on' : ''}">✓</span>Save to my places for next time</button></div>` : ''}
    ${rec.length ? `<div class="mini-chips"><span class="muted small" style="align-self:center">Recent:</span>${rec.map(n => `<button data-act="pickNo" data-s="${s}" data-no="${n}">${n}</button>`).join('')}</div>` : ''}
  </div>`;
}
function drawEntry() {
  const box = $('#ef'); if (!box || !F) return; const err = F.errs;
  const dupe = F.date && S.entries[F.date] && F.date !== F.orig;
  const flds = enabledFields();
  let h = `<div class="field ${err.date ? 'err' : ''}" data-k="date"><label>Date <span class="req">*</span></label><button class="input" data-act="pickEntryDate">${ic('calendar', 20)}<span class="val">${esc(fmtDW(F.date))}</span><span class="caret">▾</span></button><div class="msg">${esc(err.date || '')}</div></div>`;
  if (dupe) h += `<div class="dup">${ic('warning', 22)}<span class="grow">${esc(fmtDW(F.date))} already has an entry.</span><button class="btn soft sm" data-act="editInstead">Edit it</button></div>`;
  h += `<div class="field"><span class="flabel">Status <span class="req">*</span></span><div class="status3">${Object.entries(STATUS).map(([k, v]) => `<button class="stbtn ${k} ${F.status === k ? 'on' : ''}" data-act="setStatus" data-v="${k}" aria-pressed="${F.status === k}">${ic(v.icon, 30)}${v.label}</button>`).join('')}</div></div>`;
  if (F.status === 'duty') {
    h += `<div class="block-err ${err.block ? 'show' : ''}" id="blk-err">${esc(err.block || '')}</div>`;
    h += shiftHtml('m', 'Morning duty', 'sunrise') + shiftHtml('e', 'Evening duty', 'sunset');
    h += flds.map(f => `<div class="field ${err['amt.' + f.id] ? 'err' : ''}" data-k="amt.${f.id}"><label for="amt-${f.id}">${esc(f.name)} (₹)</label><div class="input"><span class="pre">₹</span><input id="amt-${f.id}" data-money="${f.id}" inputmode="decimal" placeholder="0" value="${esc(moneyStr(F.amt[f.id]))}" autocomplete="off"></div><div class="msg">${esc(err['amt.' + f.id] || '')}</div></div>`).join('');
  }
  h += `<div class="field ${err.note ? 'err' : ''}" data-k="note"><label for="ef-note">Note <span class="muted" style="font-weight:500">(optional)</span></label><div class="input"><textarea id="ef-note" data-bind="note" maxlength="200" rows="2" placeholder="${F.status === 'duty' ? 'e.g. Spare duty, route change' : 'e.g. Festival holiday'}">${esc(F.note)}</textarea></div><div class="counter" id="note-c">${F.note.length}/200</div><div class="msg">${esc(err.note || '')}</div></div>`;
  box.innerHTML = h;
}
function setPath(path, v) { const [a, b] = path.split('.'); if (b) F[a][b] = v; else F[a] = v; }

document.addEventListener('input', e => {
  const t = e.target;
  if (F && t.dataset.bind) {
    let v = t.value;
    if (t.dataset.bind.endsWith('.no')) { const c = v.replace(/\D/g, '').slice(0, 6); if (c !== v) { t.value = c; } v = c; }
    setPath(t.dataset.bind, v);
    if (t.dataset.bind === 'note') $('#note-c').textContent = `${v.length}/200`;
    clearErr(t);
  }
  if (F && t.dataset.money) { F.amt[t.dataset.money] = moneyInput(t); clearErr(t); }
});
function clearErr(t) { const f = t.closest('.field'); if (f && f.classList.contains('err')) { f.classList.remove('err'); delete F.errs[f.dataset.k]; } const b = $('#blk-err'); if (b && F.errs.block) { b.classList.remove('show'); delete F.errs.block; } if (!Object.keys(F.errs).length) { const sm = $('#ef-sum'); if (sm) sm.hidden = true; } }
function moneyInput(el) {
  const pos = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, pos).replace(/[^\d.]/g, '').length;
  let raw = el.value.replace(/[^\d.]/g, '');
  const dot = raw.indexOf('.');
  if (dot >= 0) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  let [ip, dp] = raw.split('.');
  ip = (ip || '').replace(/^0+(?=\d)/, '').slice(0, 6);
  const out = (ip ? groupIN(ip) : (dp !== undefined ? '0' : '')) + (dp !== undefined ? '.' + dp : '');
  el.value = out;
  let n = 0, p = 0; while (p < out.length && n < before) { if (/[\d.]/.test(out[p])) n++; p++; }
  try { el.setSelectionRange(p, p); } catch (e) {}
  return ip || dp !== undefined ? (ip || '0') + (dp !== undefined ? '.' + dp : '') : '';
}
function validateEntry() {
  const err = {}; const t = todayIso();
  if (!F.date) err.date = 'Pick a date';
  else if (S.entries[F.date] && F.date !== F.orig) err.date = 'This date already has an entry';
  else if (F.date > addDays(t, 366)) err.date = 'Pick a date within the next year';
  if (F.status === 'duty') {
    if (F.date > t) err.date = 'On-duty entries can’t be in the future. Use Holiday or Leave to plan ahead.';
    let any = false;
    ['m', 'e'].forEach(s => {
      const x = F[s];
      if (x.no && !/^\d{1,6}$/.test(x.no)) err[s + '.no'] = 'Digits only, up to 6';
      const hasPlace = x.place || (x.other && x.text.trim());
      if (hasPlace && !x.no) err[s + '.no'] = 'Enter the duty number';
      if (x.other) { const tx = x.text.trim(); if (!tx) err[s + '.text'] = 'Type the place name, or pick one from the list'; else if (tx.length < 2) err[s + '.text'] = 'Use at least 2 letters'; }
      if (x.no) any = true;
    });
    enabledFields().forEach(f => {
      const v = F.amt[f.id]; if (v === '' || v == null) return;
      const n = parseFloat(v);
      if (!(n > 0)) err['amt.' + f.id] = 'Enter an amount above ₹0, or leave it empty';
      else if (n > 100000) err['amt.' + f.id] = 'Maximum is ₹1,00,000';
      else any = true;
    });
    if (!any && !Object.keys(err).some(k => k !== 'date')) err.block = 'Add a morning or evening duty number, or an amount.';
  }
  if (F.note.length > 200) err.note = 'Keep the note under 200 characters';
  return err;
}
function saveEntry() {
  F.errs = validateEntry();
  const n = Object.keys(F.errs).length;
  if (n) {
    drawEntry();
    const sum = $('#ef-sum'); sum.hidden = false; sum.textContent = n === 1 ? 'Please fix the highlighted field' : `Please fix ${n} highlighted fields`;
    const first = $('#ef .field.err, #ef .block-err.show'); first && first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const keys = [...new Set([F.date, F.orig].filter(Boolean))];
  const prev = {}; keys.forEach(k => prev[k] = clone(S.entries[k]));
  const created = [];
  const shift = s => {
    const x = F[s]; let place = x.place, text = '';
    if (F.status !== 'duty') return { no: '', place: null, text: '' };
    if (x.other) {
      const tx = x.text.trim().replace(/\s+/g, ' ');
      if (x.save) { let p = S.places.find(p => p.name.toLowerCase() === tx.toLowerCase()); if (!p) { p = { id: uid('p'), name: tx, catId: null, icon: null, hidden: false }; S.places.push(p); created.push(p.id); } place = p.id; }
      else { place = null; text = tx; }
    }
    return { no: x.no, place, text };
  };
  const amt = {}; if (F.status === 'duty') enabledFields().forEach(f => { const v = parseFloat(F.amt[f.id]); if (v > 0) amt[f.id] = Math.round(v * 100) / 100; });
  // keep values of switched-off amount fields when editing
  if (F.orig && S.entries[F.orig]) for (const k in S.entries[F.orig].amt) if (!enabledFields().some(f => f.id === k) && F.status === 'duty') amt[k] = S.entries[F.orig].amt[k];
  const entry = { date: F.date, status: F.status, m: shift('m'), e: shift('e'), amt, note: F.note.trim(), updatedAt: Date.now() };
  const mode = F.mode;
  if (F.orig && F.orig !== F.date) delete S.entries[F.orig];
  S.entries[F.date] = entry;
  markDirty(); closeTop(); renderAll();
  toast(`${mode === 'add' ? 'Entry added' : 'Entry updated'} · ${fmtDW(entry.date)}`, 'ok', () => {
    keys.forEach(k => { if (prev[k]) S.entries[k] = prev[k]; else delete S.entries[k]; });
    S.places = S.places.filter(p => !created.includes(p.id));
    markDirty(); renderAll(); toast('Change undone', 'info');
  });
}
function entrySummaryKV(e) {
  const kv = [['Date', fmtDW(e.date)], ['Status', STATUS[e.status].label]];
  if (e.status === 'duty') {
    if (e.m.no) kv.push(['Morning', `${e.m.no}${placeName(e.m) ? ' · ' + placeName(e.m) : ''}`]);
    if (e.e.no) kv.push(['Evening', `${e.e.no}${placeName(e.e) ? ' · ' + placeName(e.e) : ''}`]);
    S.fields.forEach(f => { if (e.amt[f.id]) kv.push([f.name, inr(e.amt[f.id])]); });
  }
  return kv;
}
function deleteEntry(date) {
  const e = S.entries[date]; if (!e) return;
  confirmDlg({ icon: 'warning', title: 'Delete this entry?', text: 'It will be removed from your records and exports.', kv: entrySummaryKV(e), ok: 'Delete entry', danger: true, onOk: () => {
    const prev = clone(e); delete S.entries[date];
    while (layers.length) closeTop();
    markDirty(); renderAll();
    toast(`Entry deleted · ${fmtDW(date)}`, 'ok', () => { S.entries[date] = prev; markDirty(); renderAll(); toast('Entry restored', 'info'); });
  } });
}
function quickMark(status, date = todayIso()) {
  const prev = clone(S.entries[date]);
  S.entries[date] = { date, status, m: { no: '', place: null, text: '' }, e: { no: '', place: null, text: '' }, amt: {}, note: '', updatedAt: Date.now() };
  markDirty(); renderAll();
  toast(`${fmtDW(date)} marked as ${STATUS[status].label.toLowerCase()}`, 'ok', () => { if (prev) S.entries[date] = prev; else delete S.entries[date]; markDirty(); renderAll(); toast('Change undone', 'info'); });
}

/* Place picker for the entry form */
function placeGroups() {
  const groups = []; const rec = recentPlaces();
  if (rec.length) groups.push({ label: 'Recently used', icon: 'hourglass', items: rec.map(id => { const p = placeById(id); return { value: id, label: p.name, sub: S.categories.find(c => c.id === p.catId)?.name || 'Uncategorised', iconHtml: letterOr(p.icon || S.categories.find(c => c.id === p.catId)?.icon, p.name, 30) }; }) });
  [...S.categories, { id: null, name: 'Uncategorised', icon: 'label' }].forEach(c => {
    const items = S.places.filter(p => p.catId === c.id && !p.hidden).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name, iconHtml: p.icon ? ic(p.icon, 30) : letterOr(null, p.name, 30) }));
    if (items.length) groups.push({ label: c.name, icon: c.icon, items });
  });
  return groups;
}

/* ---------------- Export ---------------- */
const X = { busy: false, period: 'month', month: monthKey(todayIso()), from: addDays(todayIso(), -13), to: todayIso(), status: 'all', empty: true, err: '' };
function exportRange() {
  const t = todayIso();
  if (X.period === 'month') { const k = monthKey(t); return { from: `${k}-01`, to: monthDates(k).at(-1), label: monthLabel(k), title: `${MON[+k.slice(5) - 1]} ${k.slice(0, 4)}` }; }
  if (X.period === 'pick') { const d = monthDates(X.month); return { from: d[0], to: d.at(-1), label: monthLabel(X.month), title: monthLabel(X.month) }; }
  if (X.period === 'last30') { const f = addDays(t, -29); return { from: f, to: t, label: 'Last 30 days', title: `${fmtD(f)} to ${fmtD(t)}` }; }
  return { from: X.from, to: X.to, label: 'Custom range', title: `${fmtD(X.from)} to ${fmtD(X.to)}` };
}
function exportRows() {
  const r = exportRange(); if (r.from > r.to) return { r, rows: [] };
  const rows = rangeDates(r.from, r.to).map(d => ({ d, e: S.entries[d] })).filter(({ e }) => X.status === 'all' ? (e || X.empty) : (e && e.status === X.status));
  return { r, rows };
}
function validateRange() {
  if (X.period !== 'custom') return '';
  if (!X.from || !X.to) return 'Pick both dates';
  if (X.from > X.to) return 'The start date must be on or before the end date';
  if (rangeDates(X.from, X.to).length > 366) return 'Pick a range of up to 366 days';
  return '';
}
function renderExport() {
  X.err = validateRange();
  const { r, rows } = exportRows(); const flds = enabledFields();
  const tot = totalsFor(rows.map(x => x.d));
  const P = [
    ['month', 'This month', monthLabel(monthKey(todayIso())), 'tearcal'],
    ['pick', 'Pick a month', monthLabel(X.month), 'calendar'],
    ['last30', 'Last 30 days', `${fmtD(addDays(todayIso(), -29)).slice(0, 6)} – ${fmtD(todayIso()).slice(0, 6)}`, 'hourglass'],
    ['custom', 'Custom range', `${fmtD(X.from).slice(0, 6)} – ${fmtD(X.to).slice(0, 6)}`, 'map']
  ];
  const prev = rows.slice(0, 6).map(({ d, e }, i) => `<tr class="${e?.status === 'holiday' ? 'h' : e?.status === 'leave' ? 'l' : ''}"><td>${esc(fmtD(d))}</td><td>${WD[parse(d).getDay()]}</td><td>${e ? STATUS[e.status].label : '—'}</td><td class="mono">${esc(e?.m.no || '')}</td><td class="mono">${esc(e?.e.no || '')}</td>${flds.map(f => `<td>${e?.amt[f.id] ? inr(e.amt[f.id]) : ''}</td>`).join('')}</tr>`).join('');
  $('#v-export').innerHTML = `
    <div class="h-sec"><h3>Period</h3><button class="info" data-act="info" data-info="The export uses the same layout as your printed Excel sheet: one row per day, Sundays shaded pink, and totals at the bottom.">i</button></div>
    <div class="periods">${P.map(([k, l, s, icn]) => `<button class="period ${X.period === k ? 'on' : ''}" data-act="xPeriod" data-v="${k}">${ic(icn, 32)}<div><b>${l}</b><span>${esc(s)}</span></div></button>`).join('')}</div>
    ${X.period === 'pick' ? `<div class="field"><label>Month</label><button class="input" data-act="xMonth">${ic('calendar', 20)}<span class="val">${esc(MONL[+X.month.slice(5) - 1] + ' ' + X.month.slice(0, 4))}</span><span class="caret">▾</span></button></div>` : ''}
    ${X.period === 'custom' ? `<div class="grid2" style="grid-template-columns:1fr 1fr"><div class="field ${X.err ? 'err' : ''}"><label>From <span class="req">*</span></label><button class="input" data-act="xFrom">${ic('calendar', 18)}<span class="val">${esc(fmtDW(X.from))}</span></button></div><div class="field ${X.err ? 'err' : ''}"><label>To <span class="req">*</span></label><button class="input" data-act="xTo">${ic('calendar', 18)}<span class="val">${esc(fmtDW(X.to))}</span></button></div></div>${X.err ? `<div class="block-err show">${esc(X.err)}</div>` : ''}` : ''}
    <div class="h-sec"><h3>Include</h3></div>
    <div class="chips">${[['all', 'All days'], ['duty', 'On duty'], ['holiday', 'Holiday'], ['leave', 'Leave']].map(([k, l]) => `<button class="chip ${X.status === k ? 'on' : ''}" data-act="xStatus" data-v="${k}">${l}</button>`).join('')}</div>
    ${X.status === 'all' ? `<div class="card" style="padding:4px 14px"><div class="setrow"><div class="lbl"><div>Include days without an entry<small>Prints a full calendar like the Excel sheet</small></div></div><button class="toggle ${X.empty ? 'on' : ''}" data-act="xEmpty" role="switch" aria-checked="${X.empty}" aria-label="Include days without an entry"></button></div></div>` : ''}
    <div class="h-sec"><h3>Preview</h3><span class="muted small">${esc(r.title)}</span></div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="kpis"><div class="kpi"><span>Rows</span><b class="num">${rows.length}</b></div><div class="kpi"><span>On duty</span><b class="num">${tot.duty}</b></div><div class="kpi"><span>${esc(flds[0]?.name || 'Total')}</span><b class="num">${inr(tot.amt[flds[0]?.id] || 0)}</b></div></div>
      ${rows.length ? `<div class="prev-table"><table><thead><tr><th>Date</th><th>Day</th><th>Status</th><th>Morning</th><th>Evening</th>${flds.map(f => `<th>${esc(f.name)}</th>`).join('')}</tr></thead><tbody>${prev}</tbody></table></div>${rows.length > 6 ? `<div class="muted small" style="text-align:center">+ ${rows.length - 6} more rows in the file</div>` : ''}`
        : `<div class="empty-state">${ic('inbox', 48)}<p>${X.err ? 'Fix the dates above to see a preview.' : 'Nothing to export for this period and filter.'}</p><button class="btn ghost sm" data-act="xReset">Reset filters</button></div>`}
    </div>
    <div class="dlbtns">
      ${[['pdf', 'green', 'page', 'Download PDF'], ['xlsx', 'green', 'chart', 'Download Excel'], ['csv', 'ghost', 'clipboard', 'Download CSV']].map(([f, c, icn, l]) => `<button class="btn ${c}" data-act="xDl" data-f="${f}" ${rows.length && !X.busy ? '' : 'disabled'}>${ic(icn, 20)}${X.busy === f ? 'Preparing…' : l}</button>`).join('')}
    </div>`;
}
function exportName(ext) { const r = exportRange(); const base = X.period === 'month' || X.period === 'pick' ? r.title.replace(' ', '-') : `${fmtD(r.from)}_to_${fmtD(r.to)}`; return `Duty_Tracker_${base}.${ext}`; }
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function buildCSV() {
  const { rows } = exportRows(); const flds = enabledFields();
  const head = ['#', 'Date', 'Day', 'Status', 'Morning Duty', 'Morning Place', 'Evening Duty', 'Evening Place', ...flds.map(f => `${f.name} (₹)`), 'Note'];
  const lines = [head.map(csvCell).join(',')];
  rows.forEach(({ d, e }, i) => lines.push([i + 1, fmtD(d), WDL[parse(d).getDay()], e ? STATUS[e.status].label : '', e?.m.no || '', e ? placeName(e.m) : '', e?.e.no || '', e ? placeName(e.e) : '', ...flds.map(f => e?.amt[f.id] ?? ''), e?.note || ''].map(csvCell).join(',')));
  return '﻿' + lines.join('\r\n');
}
/* Shared export model: one row per day, used by the on-screen preview, PDF, Excel and CSV.
   Colours follow the original Excel sheet. */
const XL = { title: '1F4E79', head: '2E75B6', label: 'D6E4F0', labelInk: '1F4E79', value: 'DAEEF3', holiday: 'FFE4E1', holidayInk: 'C0392B', leave: 'FFF1D9', leaveInk: '92600F', grid: 'C9D6E3' };
function exportData() {
  const { r, rows } = exportRows(); const flds = enabledFields(); const p = S.profile;
  const list = rows.map(({ d, e }, i) => ({
    n: i + 1, date: fmtD(d), day: WDL[parse(d).getDay()],
    status: e ? STATUS[e.status].label : (isOff(d) ? 'Holiday' : ''),
    kind: e?.status === 'holiday' || (!e && isOff(d)) ? 'h' : e?.status === 'leave' ? 'lv' : '',
    mNo: e?.m.no || '', mPl: e ? placeName(e.m) : '', eNo: e?.e.no || '', ePl: e ? placeName(e.e) : '',
    amt: flds.map(f => e?.amt[f.id] ?? ''), note: e?.note || ''
  }));
  const info = [['Name', p.name || '—'], ['Staff ID', p.staffId], ['Depot', p.depot], ['Period', `${fmtD(r.from)} to ${fmtD(r.to)}`]].filter(x => x[1]);
  return { r, flds, list, info, tot: totalsFor(rows.map(x => x.d)), title: `Daily Duty Tracker — ${r.title}` };
}
const money0 = v => v === '' ? '' : inr(v).replace('₹', '');
const dutyCell = (no, pl) => [no, pl].filter(Boolean).join(' · ');
const totalLabels = D => ['On Duty Days:', 'Morning Count:', 'Evening Count:', ...D.flds.map(f => `Total ${f.name}:`)];
const totalValues = D => [D.tot.duty, D.tot.m, D.tot.e, ...D.flds.map(f => money0(D.tot.amt[f.id]) || '0')];

/* On-screen preview: an A4 page with the printed block in the top-left 60% × 60% (dashed line = where to cut). */
const A4 = { w: 595.28, h: 841.89, m: 14, frac: 0.6 };
function paperHtml() {
  const D = exportData();
  const body = D.list.map(x => `<tr class="${x.kind}"><td>${x.n}</td><td>${x.date}</td><td>${x.day}</td><td class="st">${x.status}</td><td>${esc(dutyCell(x.mNo, x.mPl))}</td><td>${esc(dutyCell(x.eNo, x.ePl))}</td>${x.amt.map(a => `<td>${money0(a)}</td>`).join('')}</tr>`).join('');
  return `<div class="a4"><div class="cut" aria-hidden="true"></div><div class="blk" id="blk">
    <div class="ttl">${esc(D.title)}</div>
    <table class="xinfo"><tr>${D.info.map(i => `<th>${esc(i[0])}</th>`).join('')}</tr><tr>${D.info.map(i => `<td>${esc(i[1])}</td>`).join('')}</tr></table>
    <table class="main"><thead><tr><th>#</th><th>Date</th><th>Day</th><th>Status</th><th>Morning Duty</th><th>Evening Duty</th>${D.flds.map(f => `<th>${esc(f.name)} (₹)</th>`).join('')}</tr></thead><tbody>${body}
    <tr class="tl"><td colspan="3" rowspan="2">TOTALS</td>${totalLabels(D).map(l => `<td>${esc(l)}</td>`).join('')}</tr>
    <tr class="tv">${totalValues(D).map(v => `<td>${esc(v)}</td>`).join('')}</tr></tbody></table>
  </div></div>`;
}
/* Shrink the preview text until the block fits its 60% × 60% box (mirrors the PDF's auto-fit). */
function fitBlock(el) {
  const b = el.querySelector('#blk'); if (!b) return;
  const maxH = A4.h * A4.frac - A4.m;
  for (let fs = 9; fs >= 5; fs -= 0.25) { b.style.fontSize = fs + 'px'; if (b.scrollHeight <= maxH) break; }
}
/* PDF and Excel makers are bundled and load on first export (works offline). */
async function loadLibs(kind) {
  if (kind === 'pdf' && !window.jspdf) {
    const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    at.applyPlugin(jsPDF); window.jspdf = { jsPDF };
  }
  if (kind === 'xlsx' && !window.ExcelJS) { const m = await import('exceljs/dist/exceljs.min.js'); window.ExcelJS = m.default || m; }
}
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
/* Draws the sheet at font size fs; everything stays inside the top-left 60% of the page width and height. */
function drawPDF(D, fs) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const M = A4.m, right = A4.w * A4.frac, bottom = A4.h * A4.frac, cw = right - M;
  const margin = { left: M, right: A4.w - right, top: M, bottom: A4.h - bottom };
  const th = fs * 2.3;
  doc.setFillColor(...rgb(XL.title)); doc.rect(M, M, cw, th, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(fs * 1.45);
  doc.text(D.title, M + cw / 2, M + th / 2, { align: 'center', baseline: 'middle' });
  const base = { font: 'helvetica', fontSize: fs, cellPadding: fs * 0.28, halign: 'center', valign: 'middle', lineColor: rgb(XL.grid), lineWidth: 0.4, textColor: 20, overflow: 'linebreak' };
  doc.autoTable({
    startY: M + th + fs * 0.5, margin, tableWidth: cw, theme: 'grid', styles: base,
    head: [D.info.map(i => i[0])], body: [D.info.map(i => i[1])],
    headStyles: { fillColor: rgb(XL.label), textColor: rgb(XL.labelInk), fontStyle: 'bold' },
    bodyStyles: { fillColor: rgb(XL.value), textColor: 0, fontStyle: 'bold' }
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + fs * 0.5, margin, tableWidth: cw, theme: 'grid', styles: base, showFoot: 'lastPage', showHead: 'everyPage',
    head: [['#', 'Date', 'Day', 'Status', 'Morning Duty', 'Evening Duty', ...D.flds.map(f => `${f.name} (Rs.)`)]],
    body: D.list.map(x => [x.n, x.date, x.day, x.status, dutyCell(x.mNo, x.mPl), dutyCell(x.eNo, x.ePl), ...x.amt.map(money0)]),
    foot: [[{ content: 'TOTALS', colSpan: 3, rowSpan: 2 }, ...totalLabels(D)], totalValues(D)],
    headStyles: { fillColor: rgb(XL.head), textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: rgb(XL.label), textColor: rgb(XL.labelInk), fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: fs * 2.6 } },
    didParseCell: d => {
      if (d.section === 'foot' && d.row.index === 1) { d.cell.styles.fillColor = rgb(XL.value); d.cell.styles.textColor = 0; }
      if (d.section !== 'body') return;
      const k = D.list[d.row.index].kind;
      if (k) d.cell.styles.fillColor = rgb(k === 'h' ? XL.holiday : XL.leave);
      if (k && d.column.index === 3) { d.cell.styles.textColor = rgb(k === 'h' ? XL.holidayInk : XL.leaveInk); d.cell.styles.fontStyle = 'bold'; }
    }
  });
  return doc;
}
async function buildPDF() {
  await loadLibs('pdf');
  const D = exportData(); let doc;
  // Largest font (9pt down to 6pt) that keeps the whole sheet on page 1 inside the 60% box; longer ranges continue on more pages.
  for (let fs = 9; fs >= 6; fs -= 0.25) { doc = drawPDF(D, fs); if (doc.getNumberOfPages() === 1) break; }
  return doc.output('arraybuffer');
}
async function buildXLSX() {
  await loadLibs('xlsx');
  const D = exportData(); const wb = new window.ExcelJS.Workbook(); wb.creator = 'Daily Duty Tracker';
  const ws = wb.addWorksheet(D.r.title.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'), { pageSetup: { paperSize: 9, orientation: 'portrait' } });
  const head = ['#', 'Date', 'Day', 'Status', 'Morning Duty', 'Morning Place', 'Evening Duty', 'Evening Place', ...D.flds.map(f => `${f.name} (₹)`), 'Note'];
  const n = head.length;
  const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
  const thin = { style: 'thin', color: { argb: 'FF' + XL.grid } }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  const font = (o = {}) => ({ name: 'Arial', size: 10, ...o });
  const style = (c, f, fnt) => Object.assign(c, { fill: fill(f), font: fnt, border, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } });
  // Row 1: title
  ws.mergeCells(1, 1, 1, n); style(ws.getCell(1, 1), XL.title, font({ bold: true, size: 13, color: { argb: 'FFFFFFFF' } })); ws.getCell(1, 1).value = D.title; ws.getRow(1).height = 28;
  // Rows 2–3: name / staff ID / depot / period, coloured like the sheet's TOTALS rows
  const k = D.info.length; let c0 = 1;
  D.info.forEach(([label, value], i) => {
    const span = Math.floor(n / k) + (i < n % k ? 1 : 0), c1 = c0 + span - 1;
    if (c1 > c0) { ws.mergeCells(2, c0, 2, c1); ws.mergeCells(3, c0, 3, c1); }
    for (let c = c0; c <= c1; c++) { style(ws.getCell(2, c), XL.label, font({ bold: true, color: { argb: 'FF' + XL.labelInk } })); style(ws.getCell(3, c), XL.value, font({ bold: true })); }
    ws.getCell(2, c0).value = label; ws.getCell(3, c0).value = value; c0 = c1 + 1;
  });
  const hr = ws.getRow(4); hr.values = head; hr.height = 30;
  hr.eachCell(c => style(c, XL.head, font({ bold: true, color: { argb: 'FFFFFFFF' } })));
  const first = 5, last = first + D.list.length - 1;
  const num = v => v === '' ? null : /^\d+$/.test(v) ? +v : v; const txt = v => v === '' ? null : v;
  D.list.forEach((x, i) => {
    const row = ws.getRow(first + i);
    row.values = [x.n, x.date, x.day, txt(x.status), num(x.mNo), txt(x.mPl), num(x.eNo), txt(x.ePl), ...x.amt.map(a => a === '' ? null : +a), txt(x.note)];
    for (let col = 1; col <= n; col++) {
      const c = row.getCell(col); c.border = border; c.font = font(); c.alignment = { horizontal: col === 6 || col === 8 || col === n ? 'left' : 'center', vertical: 'middle' };
      if (x.kind) c.fill = fill(x.kind === 'h' ? XL.holiday : XL.leave);
    }
    if (x.kind) row.getCell(4).font = font({ bold: true, color: { argb: 'FF' + (x.kind === 'h' ? XL.holidayInk : XL.leaveInk) } });
  });
  // TOTALS: label row + value row with live formulas, like the original sheet
  const L = last + 1, V = last + 2, col = c => ws.getColumn(c).letter;
  ws.mergeCells(L, 1, V, 3);
  for (let c = 1; c <= n; c++) { style(ws.getCell(L, c), XL.label, font({ bold: true, color: { argb: 'FF' + XL.labelInk } })); style(ws.getCell(V, c), XL.value, font({ bold: true })); }
  ws.getCell(L, 1).value = 'TOTALS';
  const labels = totalLabels(D);
  const spots = [4, 5, 7, ...D.flds.map((f, i) => 9 + i)];
  const formulas = [`COUNTIF(${col(4)}${first}:${col(4)}${last},"On duty")`, `COUNTA(${col(5)}${first}:${col(5)}${last})`, `COUNTA(${col(7)}${first}:${col(7)}${last})`, ...D.flds.map((f, i) => `SUM(${col(9 + i)}${first}:${col(9 + i)}${last})`)];
  const results = [D.tot.duty, D.tot.m, D.tot.e, ...D.flds.map(f => D.tot.amt[f.id])];
  spots.forEach((c, i) => { ws.getCell(L, c).value = labels[i]; ws.getCell(V, c).value = { formula: formulas[i], result: results[i] }; });
  ws.getRow(L).height = 22; ws.getRow(V).height = 22;
  D.flds.forEach((f, i) => { ws.getColumn(9 + i).numFmt = '[>=100000]##\\,##\\,##0;##,##0'; });
  [5, 13, 11, 10, 12, 18, 12, 18, ...D.flds.map(() => 13), 26].forEach((w, i) => ws.getColumn(i + 1).width = w);
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return await wb.xlsx.writeBuffer();
}
/* Saving: on the phone the share sheet opens (Save to Files, Drive, WhatsApp…); in a browser it downloads. */
const MIME = { csv: 'text/csv;charset=utf-8', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
async function saveFile(name, data) {
  if (native.isNative) { try { return await native.shareFile(name, data); } catch (e) { console.warn(e); return 'failed'; } }
  try {
    const url = URL.createObjectURL(new Blob([data], { type: MIME[name.split('.').pop()] }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000); return 'saved';
  } catch (e) { return 'failed'; }
}
const FMT = { pdf: { label: 'PDF', icon: 'page', note: 'A4 portrait, same look as your Excel print' }, xlsx: { label: 'Excel', icon: 'chart', note: 'Excel workbook with colours and live totals (SUM / COUNTIF)' }, csv: { label: 'CSV', icon: 'clipboard', note: 'Plain data, one row per day' } };
async function doExport(fmt, again) {
  if (X.busy) return;
  const { rows } = exportRows(); if (!rows.length) return toast('Nothing to export for this period', 'warn');
  const name = exportName(fmt);
  X.busy = fmt; renderExport(); updateAgainBtn();
  let data;
  try { data = fmt === 'csv' ? buildCSV() : fmt === 'pdf' ? await buildPDF() : await buildXLSX(); }
  catch (e) { X.busy = false; renderExport(); updateAgainBtn(); return toast(`Couldn't make the ${FMT[fmt].label} file. Check your internet connection and try again.`, 'err'); }
  if (!again) {
    const preview = fmt === 'csv'
      ? `<div class="xl" style="overflow:auto"><pre style="margin:0;padding:10px;font:11px/1.5 var(--f-mono);white-space:pre">${esc(data.replace('﻿', '').split('\r\n').slice(0, 14).join('\n'))}${rows.length > 13 ? '\n…' : ''}</pre></div>`
      : `<div class="paper-wrap">${paperHtml()}</div><div class="cut-note">Dashed line shows where to cut the printed A4 sheet</div>`;
    openLayer(`<div class="sheet-card" style="height:92%">${sheetHead('Export')}<div class="sheet-body"><div class="filecard">${ic(FMT[fmt].icon, 40)}<div class="grow"><b>${esc(name)}</b><span class="muted small">${plural(rows.length, 'row')} · ${FMT[fmt].note}</span></div></div>${preview}</div><div class="sheet-foot"><button class="btn green block" data-act="xAgain" data-f="${fmt}" id="x-again">Download again</button></div></div>`,
      { onMount: el => fitPaper(el) });
  }
  const res = await saveFile(name, data);
  X.busy = false; renderExport(); updateAgainBtn();
  if (res === 'saved') toast(`${name} saved`, 'ok');
  else if (res === 'declined') toast('Download cancelled', 'info');
  else if (res === 'busy') toast('A download is already waiting for your answer', 'warn');
  else toast(`Couldn't save ${name}. Try again.`, 'err');
}
function updateAgainBtn() { const b = $('#x-again'); if (b) { b.disabled = !!X.busy; b.textContent = X.busy ? 'Preparing…' : 'Download again'; } }
function fitPaper(el) { const p = el.querySelector('.a4'); if (!p) return; fitBlock(el); const w = el.querySelector('.paper-wrap').clientWidth - 24; const s = Math.min(1, w / 595); p.style.transform = `scale(${s})`; p.style.marginBottom = `${-(1 - s) * 842}px`; p.style.marginRight = `${-(1 - s) * 595}px`; }

/* ---------------- Settings ---------------- */
function secHtml(id, icon, title, sub, body) {
  const open = !!S.openSecs[id];
  return `<div class="sec ${open ? 'open' : ''}" id="sec-${id}"><button class="sec-h" data-act="sec" data-id="${id}" aria-expanded="${open}">${ic(icon, 32)}<div class="grow"><div class="t">${title}</div><div class="s">${sub}</div></div><span class="caret">▾</span></button><div class="sec-b">${body}</div></div>`;
}
function renderSettings() {
  const st = S.settings, p = S.profile; const use = placeUsage();
  const placesBody = `<div class="list" style="box-shadow:none;border:1px solid var(--line)">
      <button class="li" data-act="placesMgr">${ic('pin', 30)}<div class="grow"><div class="t">Places</div><div class="s">${plural(S.places.length, 'place')} · shown in the Place dropdown</div></div><span class="chev">›</span></button>
      <button class="li" data-act="catsMgr">${ic('label', 30)}<div class="grow"><div class="t">Categories</div><div class="s">${esc(S.categories.map(c => c.name).join(', ') || 'None yet')}</div></div><span class="chev">›</span></button></div>
    <button class="btn soft" data-act="addPlace">${ic('pin', 20)}Add place</button>`;
  const fieldsBody = `<div>${S.fields.map(f => `<div class="field-li">${ic('money', 28)}<button class="grow" style="text-align:left" data-act="editField" data-id="${f.id}"><div style="font-weight:700">${esc(f.name)}</div><div class="muted small">${f.on ? 'Shown in entry form and exports' : 'Hidden'} · tap to rename</div></button><button class="toggle ${f.on ? 'on' : ''}" data-act="fieldToggle" data-id="${f.id}" role="switch" aria-checked="${f.on}" aria-label="Show ${esc(f.name)}"></button></div>`).join('')}</div>
    ${S.fields.length < 4 ? `<button class="btn soft" data-act="addField">${ic('coin', 20)}Add amount field</button>` : '<div class="muted small">Up to 4 amount fields.</div>'}`;
  const rulesBody = `<div class="setrow"><div class="lbl"><div>Weekly off day<small>New entries on this day start as Holiday</small></div></div><button class="btn ghost sm" data-act="weeklyOff">${st.weeklyOff < 0 ? 'None' : WDL[st.weeklyOff]} ▾</button></div>`;
  const lookBody = `<div class="field"><span class="flabel">Theme</span><div class="seg">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['darkblue', 'Dark blue']].map(([k, l]) => `<button class="${st.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="field"><span class="flabel">Colour</span><div class="swatches">${[['navy', '#2E75B6'], ['teal', '#2A7C84'], ['plum', '#77509A'], ['slate', '#475775'], ['rust', '#A95A36']].map(([k, c]) => `<button class="swatch ${st.palette === k ? 'on' : ''}" style="background:${c}" data-act="palette" data-v="${k}" aria-label="${k} colour"></button>`).join('')}</div></div>
    <div class="field"><span class="flabel">Text size</span><div class="seg">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, l]) => `<button class="${st.text === k ? 'on' : ''}" data-act="textSize" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="setrow"><div class="lbl">Bold text</div><button class="toggle ${st.bold ? 'on' : ''}" data-act="bold" role="switch" aria-checked="${st.bold}" aria-label="Bold text"></button></div>`;
  const signedIn = cloud.configured && UID !== 'local';
  const syncBody = `<div class="sync-live">${syncDetail()}</div>
    ${signedIn ? `<div class="setrow"><div class="lbl"><div>Signed in as<small>${esc(S.auth.email)}</small></div></div></div>` : ''}
    ${cloud.configured ? `<div class="actions"><button class="btn soft" data-act="syncNow">${ic('cloud', 20)}Sync now</button>${S.sync.error === 'auth' ? '<button class="btn primary" data-act="reauth">Sign in again</button>' : ''}</div>` : ''}`;
  const rem = st.reminder;
  const remBody = `<div class="setrow"><div class="lbl"><div>Daily reminder<small>${native.isNative ? 'A notification at this time on duty days that have no entry yet' : 'Works in the Android app'}</small></div></div><button class="toggle ${rem.on ? 'on' : ''}" data-act="remToggle" role="switch" aria-checked="${rem.on}" aria-label="Daily reminder"></button></div>
    ${rem.on ? `<div class="setrow"><div class="lbl">Reminder time</div><button class="btn ghost sm" data-act="remTime">${fmtTime(rem.time)} ▾</button></div>` : ''}`;
  $('#v-settings').innerHTML = `
    <div class="card profile"><div class="avatar">${avatarHtml(58)}</div><div class="grow" style="min-width:0"><b>${esc(p.name || 'Add your name')}</b><div class="muted small" style="overflow-wrap:anywhere">${esc(S.auth.email || '')}</div>${p.staffId || p.depot ? `<div class="muted small">${esc([p.staffId && 'ID ' + p.staffId, p.depot].filter(Boolean).join(' · '))}</div>` : ''}</div><button class="btn soft sm" data-act="editProfile">Edit</button></div>
    ${secHtml('places', 'map', 'Places & categories', `${plural(S.places.length, 'place')} in ${plural(S.categories.length, 'category', 'categories')}`, placesBody)}
    ${secHtml('fields', 'money', 'Amount fields', esc(enabledFields().map(f => f.name).join(', ') || 'None shown'), fieldsBody)}
    ${secHtml('rules', 'tearcal', 'Duty rules', `Weekly off: ${st.weeklyOff < 0 ? 'None' : WDL[st.weeklyOff]}`, rulesBody)}
    ${secHtml('look', 'palette', 'Appearance', `${({ system: 'System', light: 'Light', dark: 'Dark', darkblue: 'Dark blue' })[st.theme]} theme · ${({ s: 'Small', m: 'Medium', l: 'Large' })[st.text]} text`, lookBody)}
    ${secHtml('remind', 'bell', 'Reminder', rem.on ? `Daily at ${fmtTime(rem.time)}` : 'Off', remBody)}
    ${secHtml('sync', 'cloud', 'Sync & backup', esc(syncState().text), syncBody)}
    <div class="card" style="padding:4px 14px"><div class="setrow"><div class="lbl"><div>Version ${esc(APP_VERSION)}<small>${UPD.info ? `Version ${esc(UPD.info.version)} is available` : 'Checks for updates when you open the app'}</small></div></div>${UPD.info ? '<button class="btn primary sm" data-act="updateNow">Update</button>' : '<button class="btn ghost sm" data-act="checkUpdate">Check</button>'}</div></div>
    ${signedIn ? `<button class="btn block logout" data-act="logout">${ic('lock', 20)}Log out</button>` : ''}
    <div class="ver">Daily Duty Tracker · v${esc(APP_VERSION)}</div>`;
}

/* Profile sheet */
function openProfile() {
  const p = S.profile; const draft = { ...p };
  const el = openLayer(`<div class="sheet-card" style="height:88%">${sheetHead('Edit profile')}<div class="sheet-body">
    <div class="field"><span class="flabel">Picture</span><div class="row" style="flex-wrap:wrap"><div class="avatar" id="pf-av" style="width:64px;height:64px;border-radius:20px"></div><div class="icon-grid grow" id="pf-icons" style="grid-template-columns:repeat(4,1fr)">${['bus', 'steering', 'man', 'woman', 'person', 'ticket', 'busstop', 'sun'].map(k => `<button data-k="${k}" aria-label="${k}">${ic(k, 32)}</button>`).join('')}</div></div>
      <div class="row"><label class="btn ghost sm" style="cursor:pointer">${ic('person', 18)}Upload photo<input type="file" accept="image/*" id="pf-file" hidden></label><button class="linkbtn small" id="pf-rm">Remove photo</button></div></div>
    <div class="field" data-k="name"><label for="pf-name">Full name <span class="req">*</span></label><div class="input"><input id="pf-name" maxlength="40" value="${esc(p.name)}" autocomplete="name"></div><div class="msg"></div></div>
    <div class="field"><label>Email</label><div class="input" style="opacity:.75"><span class="val">${esc(S.auth.email)}</span>${ic('lock', 16)}</div><span class="hint">To change email, log out and sign in with the new one.</span></div>
    <div class="grid2" style="grid-template-columns:1fr 1fr"><div class="field" data-k="staffId"><label for="pf-id">Staff / badge ID</label><div class="input mono"><input id="pf-id" maxlength="12" value="${esc(p.staffId)}" autocomplete="off"></div><div class="msg"></div></div>
    <div class="field" data-k="phone"><label for="pf-ph">Mobile</label><div class="input"><span class="pre">+91</span><input id="pf-ph" inputmode="numeric" maxlength="10" value="${esc(p.phone)}" autocomplete="tel-national"></div><div class="msg"></div></div></div>
    <div class="field"><label for="pf-dep">Depot / branch</label><div class="input"><input id="pf-dep" maxlength="40" value="${esc(p.depot)}" placeholder="e.g. Perundurai Depot"></div><span class="hint">Name, ID and depot are printed on exported sheets.</span></div>
    </div><div class="sheet-foot"><div class="summary" id="pf-sum" hidden></div><button class="btn primary block" id="pf-save">Update profile</button></div></div>`);
  const drawAv = () => { el.querySelector('#pf-av').innerHTML = draft.photo ? `<img class="photo" src="${draft.photo}" alt="">` : ic(draft.avatar, 46); $$('#pf-icons button', el).forEach(b => b.classList.toggle('on', !draft.photo && b.dataset.k === draft.avatar)); el.querySelector('#pf-rm').hidden = !draft.photo; };
  drawAv();
  el.querySelector('#pf-icons').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; draft.avatar = b.dataset.k; draft.photo = null; drawAv(); };
  el.querySelector('#pf-rm').onclick = () => { draft.photo = null; drawAv(); };
  el.querySelector('#pf-ph').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  el.querySelector('#pf-file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return toast('Pick an image file (JPG or PNG)', 'err');
    if (f.size > 8 * 1024 * 1024) return toast('Image is larger than 8 MB', 'err');
    const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 160; const s = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160); draft.photo = c.toDataURL('image/jpeg', .8); drawAv(); URL.revokeObjectURL(img.src); };
    img.onerror = () => toast('Could not read that image', 'err'); img.src = URL.createObjectURL(f);
  };
  el.querySelector('#pf-save').onclick = () => {
    const name = el.querySelector('#pf-name').value.trim(), id = el.querySelector('#pf-id').value.trim(), ph = el.querySelector('#pf-ph').value.trim();
    const errs = {}; if (!name) errs.name = 'Enter your name'; else if (name.length < 2) errs.name = 'Use at least 2 letters';
    if (id && !/^[A-Za-z0-9\-\/]{1,12}$/.test(id)) errs.staffId = 'Letters, digits, - or / only';
    if (ph && !/^[6-9]\d{9}$/.test(ph)) errs.phone = 'Enter a 10-digit mobile number';
    $$('.field[data-k]', el).forEach(f => { const m = errs[f.dataset.k]; f.classList.toggle('err', !!m); const mm = f.querySelector('.msg'); if (mm) mm.textContent = m || ''; });
    const n = Object.keys(errs).length; const sum = el.querySelector('#pf-sum');
    if (n) { sum.hidden = false; sum.textContent = n === 1 ? 'Please fix the highlighted field' : `Please fix ${n} highlighted fields`; el.querySelector('.field.err').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const prev = clone(S.profile);
    S.profile = { ...draft, name, staffId: id, phone: ph, depot: el.querySelector('#pf-dep').value.trim() };
    markDirty(); closeTop(); renderAll();
    toast('Profile updated', 'ok', () => { S.profile = prev; markDirty(); renderAll(); toast('Change undone', 'info'); });
  };
}

/* Places manager */
function openPlacesMgr() {
  const el = openLayer(`<div class="sheet-card" style="height:88%">${sheetHead('Places', '<button class="btn soft sm" data-act="addPlace">+ Add</button>')}<div class="pk-search"><div class="searchbox">${ic('pin', 20)}<input id="pm-q" placeholder="Search places" maxlength="40" autocomplete="off"></div></div><div class="pk-list" id="pm-list"></div></div>`);
  const draw = () => {
    const q = (el.querySelector('#pm-q').value || '').trim().toLowerCase(); const use = placeUsage(); let h = '';
    [...S.categories, { id: null, name: 'Uncategorised', icon: 'label' }].forEach(c => {
      const items = S.places.filter(p => p.catId === c.id && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
      if (!items.length) return;
      h += `<div class="pk-group">${ic(c.icon, 18)}${esc(c.name)} · ${items.length}</div>` + items.map(p => `<button class="pk-item" data-act="editPlace" data-id="${p.id}">${p.icon ? ic(p.icon, 30) : letterOr(null, p.name, 30)}<span class="t">${esc(p.name)}<small>${use[p.id] ? plural(use[p.id], 'entry', 'entries') : 'Not used yet'}${p.hidden ? ' · hidden from dropdown' : ''}</small></span><span class="chev muted">›</span></button>`).join('');
    });
    el.querySelector('#pm-list').innerHTML = h || `<div class="empty-state">${ic('map', 56)}<p>${q ? `No place matches “${esc(q)}”.` : 'No places yet. Add the villages and towns you go to.'}</p><button class="btn primary sm" data-act="addPlace">Add place</button></div>`;
  };
  el.querySelector('#pm-q').addEventListener('input', draw); el._redraw = draw; draw();
}
function redrawMgrs() { layers.forEach(l => l.el._redraw && l.el._redraw()); }
const PLACE_ICONS = ['house', 'city', 'busstop', 'station', 'office', 'school', 'hospital', 'temple', 'market', 'factory', 'tree', 'mountain', 'pin', 'bus'];
function openPlaceForm(id, preset = {}) {
  const p = id ? placeById(id) : null;
  const d = p ? { ...p } : { name: preset.name || '', catId: preset.catId ?? S.categories[0]?.id ?? null, icon: null, hidden: false };
  const used = id ? (placeUsage()[id] || 0) : 0;
  const el = openLayer(`<div class="sheet-card">${sheetHead(p ? 'Edit place' : 'Add place', p ? `<button class="iconbtn" id="pl-del" aria-label="Delete place" style="color:var(--danger)">🗑</button>` : '')}<div class="sheet-body">
    <div class="field" data-k="name"><label for="pl-name">Place name <span class="req">*</span></label><div class="input">${ic('pin', 18)}<input id="pl-name" maxlength="40" value="${esc(d.name)}" placeholder="e.g. Kavindapadi" autocomplete="off"></div><div class="msg"></div></div>
    <div class="field"><label>Category</label><button class="input" id="pl-cat"><span class="val"></span><span class="caret">▾</span></button></div>
    <div class="field"><span class="flabel">Icon <span class="muted" style="font-weight:500">(optional — first letter is used if none)</span></span><div class="icon-grid" id="pl-icons"><button data-k="" aria-label="No icon">${letterOr(null, d.name || 'A', 30)}</button>${PLACE_ICONS.map(k => `<button data-k="${k}" aria-label="${k}">${ic(k, 32)}</button>`).join('')}</div></div>
    ${p ? `<div class="setrow"><div class="lbl"><div>Show in Place dropdown<small>${used ? `Used in ${plural(used, 'entry', 'entries')}` : 'Not used yet'}</small></div></div><button class="toggle ${d.hidden ? '' : 'on'}" id="pl-vis" role="switch" aria-label="Show in dropdown"></button></div>` : ''}
    </div><div class="sheet-foot"><button class="btn primary block" id="pl-save">${p ? 'Update place' : 'Add place'}</button></div></div>`);
  const drawCat = () => { const c = S.categories.find(c => c.id === d.catId); el.querySelector('#pl-cat .val').innerHTML = c ? `${esc(c.name)}` : 'Uncategorised'; };
  const drawIc = () => $$('#pl-icons button', el).forEach(b => b.classList.toggle('on', (b.dataset.k || null) === (d.icon || null)));
  drawCat(); drawIc();
  el.querySelector('#pl-cat').onclick = () => openPicker({ title: 'Category', search: false, value: d.catId || '__none', groups: [{ label: 'Categories', items: [...S.categories.map(c => ({ value: c.id, label: c.name, icon: c.icon })), { value: '__none', label: 'Uncategorised', icon: 'label' }] }], extra: [{ value: '__new', label: 'New category…', icon: 'label' }], onPick: v => { if (v === '__new') return openCatForm(null, c => { d.catId = c; drawCat(); }); d.catId = v === '__none' ? null : v; drawCat(); } });
  el.querySelector('#pl-icons').onclick = e => { const b = e.target.closest('button'); if (!b) return; d.icon = b.dataset.k || null; drawIc(); };
  const vis = el.querySelector('#pl-vis'); if (vis) vis.onclick = () => { d.hidden = !d.hidden; vis.classList.toggle('on', !d.hidden); };
  el.querySelector('#pl-name').addEventListener('input', e => { el.querySelector('.field[data-k=name]').classList.remove('err'); });
  el.querySelector('#pl-save').onclick = () => {
    const name = el.querySelector('#pl-name').value.trim().replace(/\s+/g, ' ');
    let msg = ''; if (!name) msg = 'Enter the place name'; else if (name.length < 2) msg = 'Use at least 2 letters'; else if (S.places.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) msg = 'You already have a place with this name';
    const f = el.querySelector('.field[data-k=name]'); f.classList.toggle('err', !!msg); f.querySelector('.msg').textContent = msg; if (msg) return;
    const prev = clone(S.places);
    if (p) Object.assign(p, { name, catId: d.catId, icon: d.icon, hidden: d.hidden }); else S.places.push({ id: uid('p'), name, catId: d.catId, icon: d.icon, hidden: false });
    markDirty(); closeTop(); renderAll(); redrawMgrs();
    toast(p ? `Place updated · ${name}` : `Place added · ${name}`, 'ok', () => { S.places = prev; markDirty(); renderAll(); redrawMgrs(); toast('Change undone', 'info'); });
  };
  const del = el.querySelector('#pl-del');
  if (del) del.onclick = () => {
    if (used) return toast(`${p.name} is used in ${plural(used, 'entry', 'entries')}. Rename it, or turn off “Show in Place dropdown”.`, 'warn');
    confirmDlg({ title: `Delete ${p.name}?`, kv: [['Category', S.categories.find(c => c.id === p.catId)?.name || 'Uncategorised']], ok: 'Delete place', danger: true, onOk: () => { const prev = clone(S.places); S.places = S.places.filter(x => x.id !== id); closeTop(); markDirty(); renderAll(); redrawMgrs(); toast(`Place deleted · ${p.name}`, 'ok', () => { S.places = prev; markDirty(); renderAll(); redrawMgrs(); toast('Place restored', 'info'); }); } });
  };
}
const CAT_ICONS = ['house', 'city', 'busstop', 'station', 'office', 'school', 'hospital', 'temple', 'market', 'factory', 'tree', 'mountain', 'map', 'label'];
function openCatsMgr() {
  const el = openLayer(`<div class="sheet-card">${sheetHead('Categories', '<button class="btn soft sm" data-act="addCat">+ Add</button>')}<div class="pk-list" id="cm-list" style="padding-top:4px"></div></div>`);
  const draw = () => { el.querySelector('#cm-list').innerHTML = S.categories.length ? S.categories.map(c => { const n = S.places.filter(p => p.catId === c.id).length; return `<button class="pk-item" data-act="editCat" data-id="${c.id}">${letterOr(c.icon, c.name, 32)}<span class="t">${esc(c.name)}<small>${plural(n, 'place')}</small></span><span class="chev muted">›</span></button>`; }).join('') : `<div class="empty-state">${ic('label', 56)}<p>No categories yet. Group places as villages, towns or depots.</p><button class="btn primary sm" data-act="addCat">Add category</button></div>`; };
  el._redraw = draw; draw();
}
function openCatForm(id, onDone) {
  const c = id ? S.categories.find(x => x.id === id) : null; const d = c ? { ...c } : { name: '', icon: null };
  const el = openLayer(`<div class="sheet-card">${sheetHead(c ? 'Edit category' : 'Add category', c ? `<button class="iconbtn" id="ct-del" aria-label="Delete category" style="color:var(--danger)">🗑</button>` : '')}<div class="sheet-body">
    <div class="field" data-k="name"><label for="ct-name">Category name <span class="req">*</span></label><div class="input"><input id="ct-name" maxlength="30" value="${esc(d.name)}" placeholder="e.g. Villages" autocomplete="off"></div><div class="msg"></div></div>
    <div class="field"><span class="flabel">Icon</span><div class="icon-grid" id="ct-icons">${CAT_ICONS.map(k => `<button data-k="${k}" aria-label="${k}">${ic(k, 32)}</button>`).join('')}</div></div>
    </div><div class="sheet-foot"><button class="btn primary block" id="ct-save">${c ? 'Update category' : 'Add category'}</button></div></div>`);
  const drawIc = () => $$('#ct-icons button', el).forEach(b => b.classList.toggle('on', b.dataset.k === d.icon)); drawIc();
  el.querySelector('#ct-icons').onclick = e => { const b = e.target.closest('button'); if (!b) return; d.icon = d.icon === b.dataset.k ? null : b.dataset.k; drawIc(); };
  el.querySelector('#ct-save').onclick = () => {
    const name = el.querySelector('#ct-name').value.trim().replace(/\s+/g, ' ');
    let msg = ''; if (!name) msg = 'Enter a category name'; else if (S.categories.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) msg = 'This category already exists';
    const f = el.querySelector('.field[data-k=name]'); f.classList.toggle('err', !!msg); f.querySelector('.msg').textContent = msg; if (msg) return;
    const prev = clone(S.categories); let newId = id;
    if (c) Object.assign(c, { name, icon: d.icon }); else { newId = uid('c'); S.categories.push({ id: newId, name, icon: d.icon }); }
    markDirty(); closeTop(); renderAll(); redrawMgrs(); onDone && onDone(newId);
    toast(c ? `Category updated · ${name}` : `Category added · ${name}`, 'ok', () => { S.categories = prev; markDirty(); renderAll(); redrawMgrs(); toast('Change undone', 'info'); });
  };
  const del = el.querySelector('#ct-del');
  if (del) del.onclick = () => { const n = S.places.filter(p => p.catId === id).length; if (n) return toast(`${c.name} still has ${plural(n, 'place')}. Move them to another category first.`, 'warn'); confirmDlg({ title: `Delete ${c.name}?`, ok: 'Delete category', danger: true, onOk: () => { const prev = clone(S.categories); S.categories = S.categories.filter(x => x.id !== id); closeTop(); markDirty(); renderAll(); redrawMgrs(); toast(`Category deleted · ${c.name}`, 'ok', () => { S.categories = prev; markDirty(); renderAll(); redrawMgrs(); toast('Category restored', 'info'); }); } }); };
}
function openFieldForm(id) {
  const f = id ? S.fields.find(x => x.id === id) : null;
  const el = openLayer(`<div class="sheet-card">${sheetHead(f ? 'Rename amount field' : 'Add amount field')}<div class="sheet-body">
    <div class="field" data-k="name"><label for="fd-name">Field name <span class="req">*</span></label><div class="input"><span class="pre">₹</span><input id="fd-name" maxlength="24" value="${esc(f?.name || '')}" placeholder="e.g. Bus Fare, Batta, Overtime" autocomplete="off"></div><div class="msg"></div><span class="hint">Shown as a column in the entry form, Records and exports.</span></div>
    </div><div class="sheet-foot"><button class="btn primary block" id="fd-save">${f ? 'Update amount field' : 'Add amount field'}</button></div></div>`);
  el.querySelector('#fd-save').onclick = () => {
    const name = el.querySelector('#fd-name').value.trim().replace(/\s+/g, ' ');
    let msg = ''; if (!name) msg = 'Enter a name'; else if (S.fields.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) msg = 'A field with this name exists';
    const fe = el.querySelector('.field[data-k=name]'); fe.classList.toggle('err', !!msg); fe.querySelector('.msg').textContent = msg; if (msg) return;
    const prev = clone(S.fields);
    if (f) f.name = name; else S.fields.push({ id: uid('f'), name, on: true });
    markDirty(); closeTop(); renderAll();
    toast(f ? `Renamed to ${name}` : `Amount field added · ${name}`, 'ok', () => { S.fields = prev; markDirty(); renderAll(); toast('Change undone', 'info'); });
  };
}

/* ---------------- Sign-in (6-digit email code) ---------------- */
const A = { attempts: 0, lockUntil: 0, resendAt: 0, timer: null, busy: false, email: '' };
function showAuth(step) {
  $('#main').hidden = true; $('#auth').hidden = false;
  ['email', 'code', 'name', 'loading'].forEach(s => { $('#auth-' + s).hidden = s !== step; });
  if (step === 'code') { buildOtp(); tickAuth(); }
  if (step === 'email') setTimeout(() => $('#email').focus(), 50);
  if (step === 'name') setTimeout(() => $('#onb-name').focus(), 50);
}
function buildOtp() {
  const box = $('#otp'); box.innerHTML = Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" maxlength="1" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Digit ${i + 1}">`).join('');
  const ins = $$('input', box); ins[0].focus();
  ins.forEach((inp, i) => {
    inp.addEventListener('input', () => { const v = inp.value.replace(/\D/g, ''); if (v.length > 1) { fillOtp(v, i); return; } inp.value = v; box.classList.remove('bad'); if (v && i < 5) ins[i + 1].focus(); if (ins.every(x => x.value)) verifyCode(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && i > 0) { ins[i - 1].focus(); ins[i - 1].value = ''; } });
    inp.addEventListener('paste', e => { e.preventDefault(); fillOtp((e.clipboardData.getData('text') || '').replace(/\D/g, ''), 0); });
  });
}
function fillOtp(v, from) { const ins = $$('#otp input'); for (let k = 0; k < v.length && from + k < 6; k++) ins[from + k].value = v[k]; const nx = ins.find(x => !x.value); (nx || ins[5]).focus(); if (ins.every(x => x.value)) verifyCode(); }
function tickAuth() {
  clearInterval(A.timer);
  const run = () => {
    const now = Date.now(); const rs = $('#resend'); const msg = $('#otp-msg'); const vb = $('#verify-btn');
    const wait = Math.ceil((A.resendAt - now) / 1000); rs.disabled = wait > 0; rs.textContent = wait > 0 ? `Resend in ${wait}s` : 'Resend code';
    const lock = Math.ceil((A.lockUntil - now) / 1000);
    if (lock > 0) { msg.className = 'auth-msg err'; msg.textContent = `Too many wrong codes. Try again in ${Math.floor(lock / 60)}:${pad(lock % 60)}.`; vb.disabled = true; $$('#otp input').forEach(i => { i.disabled = true; }); }
    else if (vb.dataset.locked) { delete vb.dataset.locked; vb.disabled = false; $$('#otp input').forEach(i => { i.disabled = false; }); msg.textContent = ''; A.attempts = 0; }
    if (lock > 0) vb.dataset.locked = '1';
    if (wait <= 0 && lock <= 0) clearInterval(A.timer);
  };
  run(); A.timer = setInterval(run, 1000);
}
function authMsg(e) {
  if (e.code === 'offline') return 'You are offline. Connect to the internet to sign in.';
  if (e.code === 'rate') return 'Too many codes were requested. Wait a few minutes, then try again.';
  if (e.code === 'badcode') return 'That code is wrong or has expired.';
  return `Sign-in server problem: ${e.message}. Try again in a moment.`;
}
function busyBtn(sel, busy, label) { const b = $(sel); if (!b) return; if (busy) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; } else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; } }
async function sendCode(resend) {
  if (A.busy) return;
  const v = (resend ? A.email : $('#email').value.trim()).toLowerCase(); const f = $('#f-email');
  let msg = ''; if (!v) msg = 'Enter your email'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) msg = 'Enter a valid email, like name@gmail.com';
  else if (!isOnline()) msg = 'You are offline. Connect to the internet to get a sign-in code.';
  if (!resend) { f.classList.toggle('err', !!msg); f.querySelector('.msg').textContent = msg; }
  if (msg) { if (resend) toast(msg, 'warn'); return; }
  A.busy = true; if (!resend) busyBtn('#send-btn', true, 'Sending…');
  try {
    await cloud.sendCode(v);
    A.email = v; A.resendAt = Date.now() + 60000;
    if (resend) { tickAuth(); toast('New code sent', 'ok'); }
    else { $('#code-sub').textContent = `Sent to ${v}. Check spam if it doesn't arrive.`; showAuth('code'); toast('Code sent. Check your email.', 'ok'); }
  } catch (e) {
    if (resend) toast(authMsg(e), 'err');
    else { f.classList.add('err'); f.querySelector('.msg').textContent = authMsg(e); }
  } finally { A.busy = false; if (!resend) busyBtn('#send-btn', false); }
}
async function verifyCode() {
  if (Date.now() < A.lockUntil || A.busy) return;
  const code = $$('#otp input').map(i => i.value).join(''); const msg = $('#otp-msg');
  if (code.length < 6) { msg.className = 'auth-msg err'; msg.textContent = 'Enter all 6 digits'; return; }
  A.busy = true; busyBtn('#verify-btn', true, 'Checking…');
  let session = null;
  try { session = await cloud.verifyCode(A.email, code); }
  catch (e) {
    if (e.code === 'badcode') {
      A.attempts++; $('#otp').classList.add('bad'); $$('#otp input').forEach(i => { i.value = ''; }); $$('#otp input')[0].focus();
      if (A.attempts >= 3) { A.lockUntil = Date.now() + 60000; }
      else { msg.className = 'auth-msg err'; msg.textContent = `Wrong or expired code. ${plural(3 - A.attempts, 'attempt')} left.`; }
    } else { msg.className = 'auth-msg err'; msg.textContent = authMsg(e); }
  } finally { A.busy = false; busyBtn('#verify-btn', false); if (A.lockUntil > Date.now()) tickAuth(); }
  if (session) { A.attempts = 0; await afterSignIn(session); }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
async function afterSignIn(session) {
  loadAccount(session.user.id);
  S.auth.email = session.user.email || A.email; save();
  showAuth('loading');
  await withTimeout(runSync(), 20000);
  if (!S.profile.name) showAuth('name'); else { enterApp(); toast('Signed in', 'ok'); }
}
function enterApp() {
  $('#auth').hidden = true; $('#main').hidden = false;
  applyLook(); renderAll(); showTab('home', true);
  scheduleSync(400); refreshReminders(); checkUpdate();
}

/* ---------------- Daily reminder ---------------- */
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
function refreshReminders() {
  if (!native.isNative) return;
  const r = S.settings.reminder;
  if (!r.on || UID === null || $('#main').hidden) { native.scheduleReminders([]); return; }
  const [hh, mm] = r.time.split(':').map(Number); const now = new Date(); const list = [];
  for (let i = 0; i < 14 && list.length < 7; i++) {
    const d = addDays(todayIso(), i); if (S.entries[d] || isOff(d)) continue;
    const at = parse(d); at.setHours(hh, mm, 0, 0); if (at <= now) continue;
    list.push({ id: 1000 + i, at, date: d, body: `No entry for ${fmtDW(d)} yet. Tap to add your duty and fare.` });
  }
  native.scheduleReminders(list);
}

/* ---------------- App updates ---------------- */
const UPD = { info: null, checkedAt: 0 };
function cmpVer(a, b) { const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0), pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; }
async function checkUpdate(manual) {
  if (!UPDATE_URL) { if (manual) toast(`You have version ${APP_VERSION}. Update checks aren't set up for this build.`, 'info'); return; }
  if (!manual && Date.now() - UPD.checkedAt < 30 * 60000) return;
  UPD.checkedAt = Date.now();
  try {
    const r = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = await r.json();
    UPD.info = v && v.version && cmpVer(v.version, APP_VERSION) > 0 ? v : null;
    if (manual) toast(UPD.info ? `Version ${v.version} is available` : `You have the latest version (${APP_VERSION})`, UPD.info ? 'info' : 'ok');
  } catch (e) { if (manual) toast(isOnline() ? "Couldn't check for updates right now" : 'You are offline. Connect to check for updates.', 'warn'); }
  renderUpdate();
}
const isMajorUpdate = () => UPD.info && cmpVer(String(parseInt(UPD.info.version, 10)), String(parseInt(APP_VERSION, 10))) > 0;
function renderUpdate() {
  const block = $('#upd-block'); const major = isMajorUpdate();
  block.hidden = !major;
  if (major) $('#upd-ver').textContent = `Version ${UPD.info.version} is required. Your version is ${APP_VERSION}.`;
  if (!$('#main').hidden) { renderHome(); renderSettings(); }
}
function updateBanner() {
  if (!UPD.info || isMajorUpdate()) return '';
  const sn = LS.get('ddt:updSnooze') || {};
  if (sn.v === UPD.info.version && Date.now() < sn.until) return '';
  return `<div class="card upd-card"><div class="upd">${ic('bell', 34)}<div class="grow"><b>Version ${esc(UPD.info.version)} is available</b><span class="muted small">${esc(UPD.info.notes || 'Update to get the latest fixes.')}</span></div></div><div class="actions"><button class="btn primary sm" data-act="updateNow">Update now</button><button class="btn ghost sm" data-act="updateLater">Later</button></div></div>`;
}
function updateNow() {
  if (!UPD.info) return;
  if (native.isNative && UPD.info.apk) { native.openUrl(UPD.info.apk); toast('Downloading the update. Open the file when it finishes to install it.', 'info'); }
  else location.reload();
}

/* ---------------- Actions (event delegation) ---------------- */
const ACT = {
  close: () => closeTop(),
  info: b => showInfo(b, b.dataset.info),
  tab: b => { while (layers.length) closeTop(); showTab(b.dataset.tab); },
  fab: () => openEntry(cur === 'records' && R.month !== monthKey(todayIso()) ? firstOpenDay(R.month) : todayIso()),
  addFor: b => openEntry(b.dataset.date),
  editEntry: b => openEntry(b.dataset.date),
  openMissing: () => { R.month = monthKey(todayIso()); R.filter = 'missing'; R.q = ''; renderRecords(); showTab('records'); },
  repeatLast: () => { const ld = lastDuty(); if (!ld) return; const sh = x => ({ ...blankShift(), no: x.no, place: x.place, text: x.text, other: !x.place && !!x.text, save: false }); const amt = {}; for (const k in ld.amt) amt[k] = String(ld.amt[k]); openEntry(todayIso(), { status: 'duty', m: sh(ld.m), e: sh(ld.e), amt, note: '' }); toast(`Filled from ${fmtDW(ld.date)} — check and save`, 'info'); },
  quick: b => quickMark(b.dataset.status),
  mPrev: () => { R.month = shiftMonth(R.month, -1); renderRecords(); },
  mNext: () => { R.month = shiftMonth(R.month, 1); renderRecords(); },
  mPick: () => openPicker({ title: 'Choose month', search: false, value: R.month, groups: monthOptions(), onPick: v => { R.month = v; renderRecords(); } }),
  rFilter: b => { R.filter = b.dataset.f; renderRecords(); },
  clearQ: () => { R.q = ''; renderRecords(); },
  resetRec: () => { R.q = ''; R.filter = 'all'; renderRecords(); },
  syncSheet: () => openLayer(`<div class="sheet-card">${sheetHead('Sync status')}<div class="sheet-body"><div class="sync-live">${syncDetail()}</div><div class="muted small">Entries are saved on this phone first. When the internet is available they upload to your account automatically. Green = synced, orange = waiting or syncing, red = offline or failed.</div></div>${cloud.configured ? `<div class="sheet-foot">${S.sync.error === 'auth' ? '<button class="btn primary block" data-act="reauth">Sign in again</button>' : '<button class="btn primary block" data-act="syncNow">Sync now</button>'}</div>` : ''}</div>`),
  syncNow: async () => {
    if (!canSync()) return toast('Cloud backup is not set up in this build yet', 'info');
    if (!isOnline()) return toast('You are offline. Changes will upload when you reconnect.', 'warn');
    await runSync();
    toast(S.sync.error ? (S.sync.error === 'auth' ? 'Sign in again to sync' : "Sync failed. It will retry automatically.") : 'Everything is synced', S.sync.error ? 'err' : 'ok');
  },
  reauth: () => { while (layers.length) closeTop(true); $('#email').value = S.auth.email; showAuth('email'); },
  remToggle: async () => {
    const r = S.settings.reminder;
    if (!r.on) {
      if (!native.isNative) return toast('Reminders work in the Android app', 'info');
      const p = await native.reminderPermission(true);
      if (p !== 'granted') return toast('Notifications are blocked. Allow them in Android Settings → Apps → Duty Tracker → Notifications.', 'warn');
    }
    r.on = !r.on; markDirty(); renderSettings(); refreshReminders();
    toast(r.on ? `Daily reminder on at ${fmtTime(r.time)}` : 'Daily reminder off', 'ok');
  },
  remTime: () => {
    const slot = (h, m) => `${pad(h)}:${pad(m)}`; const groups = [['Morning', 6, 12, 'sunrise'], ['Afternoon', 12, 17, 'sun'], ['Evening', 17, 21, 'sunset'], ['Night', 21, 24, 'moon']];
    openPicker({ title: 'Reminder time', search: false, value: S.settings.reminder.time, groups: groups.map(([label, a, b, icon]) => ({ label, icon, items: Array.from({ length: (b - a) * 2 }, (_, k) => slot(a + Math.floor(k / 2), (k % 2) * 30)).map(t => ({ value: t, label: fmtTime(t), icon })) })),
      onPick: v => { S.settings.reminder.time = v; markDirty(); renderSettings(); refreshReminders(); toast(`Reminder set for ${fmtTime(v)}`, 'ok'); } });
  },
  checkUpdate: () => checkUpdate(true),
  updateNow: () => updateNow(),
  updateLater: () => { if (UPD.info) LS.set('ddt:updSnooze', { v: UPD.info.version, until: Date.now() + 24 * 3600e3 }); renderHome(); toast('We will remind you about this update tomorrow', 'info'); },
  // Entry form
  saveEntry: () => saveEntry(),
  delEntry: () => deleteEntry(F.orig),
  setStatus: b => { F.status = b.dataset.v; F.errs = {}; $('#ef-sum').hidden = true; drawEntry(); },
  pickEntryDate: () => openCalendar({ value: F.date, title: 'Entry date', onPick: d => { F.date = d; if (F.mode === 'add' && !S.entries[d]) F.status = F.status === 'duty' && isOff(d) ? 'holiday' : F.status; delete F.errs.date; drawEntry(); } }),
  editInstead: () => { const d = F.date; closeTop(); setTimeout(() => openEntry(d), 60); },
  pickPlace: b => { const s = b.dataset.s; const x = F[s]; openPicker({ title: b.closest('.shift').querySelector('.shift-h .grow').textContent + ' · place', value: x.other ? '__other' : x.place, groups: placeGroups(), placeholder: 'Search places', extra: [{ value: '__other', label: 'Other (type manually)', sub: 'For a place not in your list', icon: 'pencil' }, ...(x.place || x.other ? [{ value: '__none', label: 'No place', icon: 'label' }] : [])], onPick: (v, q) => { if (v === '__other') { x.other = true; x.place = null; x.text = x.text || q || ''; } else if (v === '__none') { x.other = false; x.place = null; x.text = ''; } else { x.other = false; x.place = v; x.text = ''; } delete F.errs[s + '.text']; drawEntry(); if (v === '__other') setTimeout(() => $('#tx-' + s)?.focus(), 350); } }); },
  toggleSave: b => { const x = F[b.dataset.s]; x.save = !x.save; b.querySelector('.checkbox').classList.toggle('on', x.save); },
  pickNo: b => { F[b.dataset.s].no = b.dataset.no; delete F.errs[b.dataset.s + '.no']; delete F.errs.block; drawEntry(); },
  clearShift: b => { F[b.dataset.s] = blankShift(); drawEntry(); },
  // Export
  xPeriod: b => { X.period = b.dataset.v; renderExport(); if (X.period === 'pick') ACT.xMonth(); },
  xMonth: () => openPicker({ title: 'Export month', search: false, value: X.month, groups: monthOptions(), onPick: v => { X.month = v; renderExport(); } }),
  xFrom: () => openCalendar({ value: X.from, title: 'From date', onPick: d => { X.from = d; renderExport(); } }),
  xTo: () => openCalendar({ value: X.to, title: 'To date', onPick: d => { X.to = d; renderExport(); } }),
  xStatus: b => { X.status = b.dataset.v; renderExport(); },
  xEmpty: () => { X.empty = !X.empty; renderExport(); },
  xReset: () => { Object.assign(X, { period: 'month', status: 'all', empty: true }); renderExport(); },
  xDl: b => { if (X.err) return toast(X.err, 'err'); doExport(b.dataset.f); },
  xAgain: b => doExport(b.dataset.f, true),
  // Settings
  sec: b => { const id = b.dataset.id; const el = $('#sec-' + id); const open = !el.classList.contains('open'); el.classList.toggle('open', open); b.setAttribute('aria-expanded', open); if (open) S.openSecs[id] = 1; else delete S.openSecs[id]; save(); },
  editProfile: () => openProfile(),
  placesMgr: () => openPlacesMgr(),
  catsMgr: () => openCatsMgr(),
  addPlace: () => openPlaceForm(null),
  editPlace: b => openPlaceForm(b.dataset.id),
  addCat: () => openCatForm(null),
  editCat: b => openCatForm(b.dataset.id),
  addField: () => openFieldForm(null),
  editField: b => openFieldForm(b.dataset.id),
  fieldToggle: b => { const f = S.fields.find(x => x.id === b.dataset.id); if (f.on && enabledFields().length === 1) return toast('Keep at least one amount field switched on', 'warn'); f.on = !f.on; markDirty(); renderAll(); toast(`${f.name} ${f.on ? 'shown' : 'hidden'} in entries and exports`, 'ok', () => { f.on = !f.on; markDirty(); renderAll(); }); },
  weeklyOff: () => openPicker({ title: 'Weekly off day', search: false, value: String(S.settings.weeklyOff), groups: [{ label: 'Days', items: [...WDL.map((w, i) => ({ value: String(i), label: w, icon: i === 0 ? 'beach' : 'tearcal' })), { value: '-1', label: 'No weekly off', icon: 'bus' }] }], onPick: v => { const prev = S.settings.weeklyOff; S.settings.weeklyOff = +v; markDirty(); renderAll(); toast(`Weekly off set to ${+v < 0 ? 'none' : WDL[+v]}`, 'ok', () => { S.settings.weeklyOff = prev; markDirty(); renderAll(); }); } }),
  theme: b => { S.settings.theme = b.dataset.v; save(); applyLook(); renderSettings(); },
  palette: b => { S.settings.palette = b.dataset.v; save(); applyLook(); renderSettings(); },
  textSize: b => { S.settings.text = b.dataset.v; save(); applyLook(); renderSettings(); },
  bold: () => { S.settings.bold = !S.settings.bold; save(); applyLook(); renderSettings(); },
  logout: () => {
    const go = async () => {
      await cloud.signOut(); clearTimeout(syncTimer); native.scheduleReminders([]);
      while (layers.length) closeTop(true);
      LS.set('ddt:account', UID); $$('#otp input').forEach(i => { i.value = ''; }); $('#email').value = S.auth.email;
      showAuth('email'); toast('Logged out', 'ok');
    };
    if (S.sync.pending) confirmDlg({ title: 'Log out with unsynced changes?', text: `${plural(S.sync.pending, 'change')} haven't uploaded yet. They stay on this phone and upload when you sign in again with the same email.`, ok: 'Log out anyway', danger: true, onOk: go });
    else confirmDlg({ icon: 'lock', title: 'Log out?', text: 'Your entries are safely synced. Sign in again with your email code any time.', ok: 'Log out', onOk: go });
  },
  // Auth
  sendCode: () => sendCode(), verify: () => verifyCode(), changeEmail: () => showAuth('email'),
  resend: () => { if (Date.now() < A.resendAt) return; sendCode(true); },
  saveName: () => { const v = $('#onb-name').value.trim(); const f = $('#f-name'); const msg = !v ? 'Enter your name' : v.length < 2 ? 'Use at least 2 letters' : ''; f.classList.toggle('err', !!msg); f.querySelector('.msg').textContent = msg; if (msg) return; S.profile.name = v; markDirty(); enterApp(); toast(`Welcome, ${v}`, 'ok'); }
};
function shiftMonth(k, n) { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function firstOpenDay(k) { const t = todayIso(); return monthDates(k).find(d => !S.entries[d] && d <= t && !isOff(d)) || monthDates(k).find(d => d <= t) || `${k}-01`; }
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t || t.disabled) return; const fn = ACT[t.dataset.act]; if (fn) { e.preventDefault(); fn(t, e); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter') { if (e.target.id === 'email') sendCode(); if (e.target.id === 'onb-name') ACT.saveName(); } });

function renderAll() { renderTop(); renderHome(); renderRecords(); renderExport(); renderSettings(); }

/* ---------------- Boot ---------------- */
function handleBack() {
  if ($('.pop')) { $('.pop').remove(); return; }
  if (layers.length) { closeTop(true); return; }
  if (!$('#main').hidden && cur !== 'home') { showTab('home', true); return; }
  native.exitApp();
}
async function boot() {
  applyLook(); fillIcons();
  $('#auth-logo').innerHTML = ic('bus', 52); $('#ic-env').innerHTML = ic('envelope', 20); $('#upd-ic').innerHTML = ic('bell', 64);
  native.onBack(handleBack);
  native.onResume(() => { if (!$('#main').hidden) { renderAll(); scheduleSync(200); refreshReminders(); checkUpdate(); } });
  native.onReminderTap(date => { if ($('#main').hidden || !date) return; while (layers.length) closeTop(true); showTab('home', true); openEntry(date); });
  if (!cloud.configured) {
    loadAccount('local');
    if (S.profile.name) enterApp(); else showAuth('name');
    return;
  }
  let session = null;
  try { session = await cloud.getSession(); } catch (e) { session = null; }
  if (session) {
    loadAccount(session.user.id);
    S.auth.email = session.user.email || S.auth.email;
    if (S.profile.name) { enterApp(); return; }
    showAuth('loading'); await withTimeout(runSync(), 20000);
    if (S.profile.name) enterApp(); else showAuth('name');
  } else {
    const last = LS.get('ddt:account'); const prev = last && LS.get('ddt:data:' + last);
    $('#email').value = (prev && prev.auth && prev.auth.email) || '';
    showAuth('email');
  }
}
setInterval(() => { if (!$('#main').hidden) updateSync(); }, 30000);
boot();

/* Test hooks (only in the e2e build). */
if (import.meta.env.VITE_E2E === '1') {
  Object.assign(window, { todayIso, addDays, parse, fmtDW, fmtD, daysIn, monthDates, monthKey, shiftMonth, inr, openEntry, drawEntry, closeTop, buildCSV, exportRange, exportRows, renderExport, renderRecords, quickMark, markDirty, save, placeGroups, defaultStatus, missingDays, enabledFields, openCalendar, applyLook, enterApp, showTab, toast, runSync, loadAccount, checkUpdate, R, X, layers, app, cloud });
  Object.defineProperty(window, 'S', { get: () => S, set: v => { S = v; } });
  Object.defineProperty(window, 'F', { get: () => F, set: v => { F = v; } });
  Object.defineProperty(window, 'META', { get: () => META });
  Object.defineProperty(window, 'cur', { get: () => cur });
}
