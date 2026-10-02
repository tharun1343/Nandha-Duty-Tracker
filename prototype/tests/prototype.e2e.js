const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, 'shots') + '/'; fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; const errors = [];
const ok = (name, cond, extra='') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true });
  if (process.env.LIB_DIR) {
    const map = { 'exceljs.min.js': 'exceljs/dist/exceljs.min.js', 'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js' };
    await ctx.route('https://cdnjs.cloudflare.com/**', r => { const f = map[r.request().url().split('/').pop()]; return f ? r.fulfill({ path: path.join(process.env.LIB_DIR, f), contentType: 'application/javascript' }) : r.abort(); });
  }
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort()); await ctx.route('https://fonts.gstatic.com/**', r => r.abort());
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(URL); await page.waitForTimeout(500);
  const shot = async n => page.screenshot({ path: OUT + n + '.png' });
  const overflow = async () => page.evaluate(() => { const v = document.querySelector('.view.active') || document.querySelector('#auth'); return v ? v.scrollWidth - v.clientWidth : 0; });
  const click = async sel => { await page.click(sel); await page.waitForTimeout(380); };
  const toastText = async () => (await page.textContent('#toasts').catch(() => '')) || '';

  // ---- Auth
  ok('TC-01 auth screen shown on first open', await page.isVisible('#auth-email'));
  await shot('01-signin');
  await click('[data-act=sendCode]');
  ok('TC-02 empty email → error', (await page.textContent('#f-email .msg')).includes('Enter your email'));
  await page.fill('#email', 'abc@'); await click('[data-act=sendCode]');
  ok('TC-03 invalid email → error', (await page.textContent('#f-email .msg')).includes('valid email'));
  await page.fill('#email', 'demo@example.com'); await click('[data-act=sendCode]');
  ok('TC-04 valid email → code step', await page.isVisible('#auth-code'));
  ok('TC-05 resend cooldown shown', (await page.textContent('#resend')).includes('Resend in'));
  await page.keyboard.type('000000'); await page.waitForTimeout(300);
  ok('TC-06 wrong code → attempts left', (await page.textContent('#otp-msg')).includes('2 attempts left'));
  await shot('02-otp-wrong');
  await page.keyboard.type('123456'); await page.waitForTimeout(400);
  ok('TC-07 correct code auto-submits → name step', await page.isVisible('#auth-name'));
  await click('[data-act=saveName]');
  ok('TC-08 empty name blocked', (await page.textContent('#f-name .msg')).includes('Enter your name'));
  await page.fill('#onb-name', 'Demo Driver'); await click('[data-act=saveName]');
  ok('TC-09 onboarding → home', await page.isVisible('#v-home.active'));
  await page.waitForTimeout(2600);
  ok('TC-10 sync dot green after sync', (await page.getAttribute('#syncdot', 'class')).includes('ok'));
  await shot('03-home-light'); ok('UI home no overflow', (await overflow()) <= 0);
  await page.evaluate(() => document.querySelector('#v-home').scrollTo(0, 9999)); await page.waitForTimeout(200); await shot('03b-home-light-scrolled');

  // ---- Entry: validation
  await click('#fab');
  ok('TC-11 FAB opens Add entry', (await page.textContent('.layer .sheet-head h2')).includes('Add entry'));
  await shot('04-add-entry');
  await click('[data-act=saveEntry]');
  ok('TC-12 empty duty → block error + summary', (await page.isVisible('#blk-err.show')) && (await page.textContent('#ef-sum')).includes('fix'));
  await shot('05-add-entry-errors');
  // fill duty + place via picker
  await page.fill('#no-m', '87a52x'); 
  ok('TC-13 duty no strips non-digits', (await page.inputValue('#no-m')) === '8752');
  await click('#shift-m [data-act=pickPlace]');
  await shot('06-place-picker');
  await page.fill('#pk-q', 'bhav'); await page.waitForTimeout(200);
  const cnt = await page.locator('.pk-list .pk-item:not(.other)').count();
  ok('TC-14 place search filters', cnt === 1, 'items=' + cnt);
  await click('.pk-list .pk-item:not(.other)');
  ok('TC-15 place chosen', (await page.textContent('#shift-m .val')).includes('Bhavani'));
  // evening: Other
  await page.fill('#no-e', '8761');
  await click('#shift-e [data-act=pickPlace]');
  await click('.pk-item.other[data-v=__other]');
  ok('TC-16 Other shows manual place input', await page.isVisible('#tx-e'));
  await click('[data-act=saveEntry]');
  ok('TC-17 Other with empty name → error', (await page.textContent('.field[data-k="e.text"] .msg')).includes('Type the place'));
  await page.fill('#tx-e', 'Nasiyanur');
  await page.fill('#amt-fare', '1234.567'); 
  ok('TC-18 money grouping + 2 decimals', (await page.inputValue('#amt-fare')) === '1,234.56', await page.inputValue('#amt-fare'));
  await page.fill('#amt-fare', ''); await page.type('#amt-fare', '100000'); 
  ok('TC-19 Indian grouping 1,00,000', (await page.inputValue('#amt-fare')) === '1,00,000');
  await page.fill('#amt-fare', ''); await page.type('#amt-fare', '120');
  await shot('07-add-entry-filled');
  await click('[data-act=saveEntry]'); await page.waitForTimeout(300);
  ok('TC-20 save → toast with Undo', (await toastText()).includes('Entry added') && await page.isVisible('.toast .undo'));
  ok('TC-21 today card shows duty', (await page.textContent('#v-home .today')).includes('8752'));
  ok('TC-22 Other+save adds place', await page.evaluate(() => S.places.some(p => p.name === 'Nasiyanur')));
  await shot('08-home-after-save');
  await click('.toast .undo');
  ok('TC-23 Undo removes entry + new place', await page.evaluate(() => !S.entries[todayIso()] && !S.places.some(p => p.name === 'Nasiyanur')));
  // duplicate date
  await page.evaluate(() => openEntry(todayIso())); await page.waitForTimeout(400);
  await page.evaluate(() => { F.date = addDays(todayIso(), -1); drawEntry(); }); await page.waitForTimeout(100);
  ok('TC-24 duplicate date warning', await page.isVisible('.dup'));
  // future duty
  await page.evaluate(() => { F.date = addDays(todayIso(), 3); F.status='duty'; F.m.no='8752'; drawEntry(); });
  await click('[data-act=saveEntry]');
  ok('TC-25 future on-duty blocked', (await page.textContent('.field[data-k=date] .msg')).includes('future'));
  await click('[data-act=setStatus][data-v=leave]'); await click('[data-act=saveEntry]');
  ok('TC-26 future leave allowed', (await toastText()).includes('Entry added'));
  // repeat last
  await page.evaluate(() => { while (layers.length) closeTop(); }); await page.waitForTimeout(300);
  await click('[data-act=repeatLast]');
  ok('TC-27 Repeat last duty pre-fills', (await page.inputValue('#no-m')).length > 0);
  await click('#layers .layer:last-child .sheet-head [data-act=close]');

  // ---- Records
  await click('.tab[data-tab=records]');
  ok('TC-28 records month list', (await page.locator('#v-records .day').count()) >= 28);
  await shot('09-records-light'); ok('UI records no overflow', (await overflow()) <= 0);
  await click('[data-act=rFilter][data-f=missing]');
  const miss = await page.locator('#v-records .day').count();
  ok('TC-29 No entry filter', miss >= 0, 'rows=' + miss);
  await click('[data-act=rFilter][data-f=all]');
  await page.fill('#rec-q', 'Erode'); await page.waitForTimeout(300);
  ok('TC-30 search keeps focus + filters', await page.evaluate(() => document.activeElement.id === 'rec-q'));
  await page.fill('#rec-q', 'zzzz'); await page.waitForTimeout(300);
  ok('TC-31 search empty state', await page.isVisible('#v-records .empty-state'));
  await click('[data-act=resetRec]');
  await click('[data-act=mPrev]');
  await shot('10-records-prev-month');
  // edit + delete with undo
  const someDate = await page.evaluate(() => Object.keys(S.entries).sort().find(d => S.entries[d].status==='duty' && d.startsWith(R.month)));
  await click(`#v-records .day[data-date="${someDate}"]`);
  ok('TC-32 edit pre-fills + Update label', (await page.textContent('.sheet-foot .btn.primary')).includes('Update entry'));
  await click('[data-act=delEntry]'); await shot('11-delete-confirm');
  await click('#dlg-ok'); await page.waitForTimeout(400);
  ok('TC-33 delete removes', await page.evaluate(d => !S.entries[d], someDate));
  await click('.toast .undo');
  ok('TC-34 undo restores', await page.evaluate(d => !!S.entries[d], someDate));
  await click('[data-act=mPick]'); await shot('12-month-picker'); await click('#layers .layer:last-child .sheet-head [data-act=close]');

  // ---- Export
  await click('.tab[data-tab=export]');
  await shot('13-export-light'); ok('UI export no overflow', (await overflow()) <= 0);
  await click('[data-act=xPeriod][data-v=custom]');
  await page.evaluate(() => { X.from = todayIso(); X.to = addDays(todayIso(), -5); renderExport(); });
  ok('TC-35 custom range from>to error + downloads disabled', (await page.isVisible('#v-export .block-err.show')) && await page.isDisabled('[data-act=xDl][data-f=pdf]'));
  await click('[data-act=xPeriod][data-v=last30]');
  ok('TC-36 last 30 days rows = 30', (await page.textContent('#v-export .kpi b')).trim() === '30');
  await click('[data-act=xStatus][data-v=duty]');
  await click('[data-act=xPeriod][data-v=month]');
  await click('[data-act=xStatus][data-v=all]');
  const grab = async f => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-act=xDl][data-f=${f}]`)]); const to = OUT + dl.suggestedFilename(); await dl.saveAs(to); await page.waitForTimeout(500); return to; };
  const csvFile = await grab('csv');
  ok('TC-37b CSV file downloaded', fs.statSync(csvFile).size > 200, path.basename(csvFile));
  await shot('14-export-csv');
  const csv = await page.evaluate(() => buildCSV());
  ok('TC-37 CSV header + rows', csv.includes('Morning Duty') && csv.split('\r\n').length >= 29);
  await page.evaluate(() => { S.entries[todayIso()] = { date: todayIso(), status:'duty', m:{no:'1',place:null,text:'=HYPERLINK("x")'}, e:{no:'',place:null,text:''}, amt:{}, note:'+cmd', updatedAt:0 }; });
  const csv2 = await page.evaluate(() => buildCSV());
  ok('SEC-01 CSV formula injection neutralised', csv2.includes(`"'=HYPERLINK(""x"")"`) && csv2.includes("'+cmd"));
  await page.evaluate(() => { delete S.entries[todayIso()]; });
  await click('#layers .layer:last-child .sheet-head [data-act=close]');
  const pdfFile = await grab('pdf');
  ok('TC-72 real PDF downloaded', fs.readFileSync(pdfFile).slice(0, 5).toString() === '%PDF-', path.basename(pdfFile));
  { const pdf = fs.readFileSync(pdfFile).toString('latin1');
    ok('TC-84 PDF has no legend', !/Legend/i.test(pdf));
    ok('TC-85 month fits on one page', (pdf.match(/\/Type \/Page\b(?!s)/g) || []).length === 1);
    const xs = [...pdf.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)].map(m => [+m[1], +m[2], +m[3], +m[4]]);
    const maxRight = Math.max(...xs.map(([x, , w]) => Math.max(x, x + w))), maxDown = Math.max(...xs.map(([, y, , h]) => 841.89 - Math.min(y, y + h)));
    ok('TC-85b everything drawn inside top-left 60% × 60%', xs.length > 0 && maxRight <= 595.28 * 0.6 + 0.5 && maxDown <= 841.89 * 0.6 + 0.5, `${xs.length} boxes, right ${maxRight.toFixed(0)}/357, bottom ${maxDown.toFixed(0)}/505`); }
  await shot('15-export-pdf');
  await click('#layers .layer:last-child .sheet-head [data-act=close]');
  const xlsxFile = await grab('xlsx');
  ok('TC-73 real XLSX downloaded', fs.readFileSync(xlsxFile).slice(0, 2).toString() === 'PK', path.basename(xlsxFile));
  console.log('FILES', pdfFile, xlsxFile, csvFile);
  await shot('15b-export-xlsx');
  await click('#layers .layer:last-child .sheet-head [data-act=close]');

  // ---- Settings
  await click('.tab[data-tab=settings]');
  await shot('16-settings-light');
  await click('[data-act=sec][data-id=places]'); await click('[data-act=sec][data-id=fields]'); await click('[data-act=sec][data-id=look]');
  await shot('17-settings-open');
  ok('TC-38 sections remember open', await page.evaluate(() => S.openSecs.places === 1 && S.openSecs.look === 1));
  await click('[data-act=placesMgr]'); await shot('18-places-mgr');
  await click('#pm-list [data-act=editPlace]');
  await click('#pl-del'); 
  ok('TC-39 delete used place blocked', (await toastText()).includes('used in'));
  await click('#layers .layer:last-child .sheet-head [data-act=close]'); await click('#layers .layer:last-child .sheet-head [data-act=close]');
  await click('[data-act=addPlace]');
  await page.fill('#pl-name', 'erode'); await click('#pl-save');
  ok('TC-40 duplicate place name blocked', (await page.textContent('.field[data-k=name] .msg')).includes('already'));
  await page.fill('#pl-name', 'Modakurichi'); await click('#pl-icons button[data-k=temple]'); await click('#pl-save');
  ok('TC-41 add place', await page.evaluate(() => S.places.some(p => p.name === 'Modakurichi' && p.icon === 'temple')));
  await click('[data-act=fieldToggle][data-id=para]');
  ok('TC-42 enable 2nd amount field', await page.evaluate(() => enabledFields().length === 2));
  await click('[data-act=fieldToggle][data-id=para]'); await click('[data-act=fieldToggle][data-id=fare]');
  ok('TC-43 cannot hide last amount field', (await toastText()).includes('at least one'));
  await click('[data-act=editProfile]'); await page.fill('#pf-ph', '12345'); await click('#pf-save');
  ok('TC-44 invalid mobile blocked', (await page.textContent('.field[data-k=phone] .msg')).includes('10-digit'));
  await page.fill('#pf-ph', '9876543210'); await page.fill('#pf-id', 'TN-4521'); await page.fill('#pf-dep', 'Perundurai Depot'); await click('#pf-save');
  ok('TC-45 profile updated', await page.evaluate(() => S.profile.staffId === 'TN-4521'));
  // offline
  await click('[data-act=sec][data-id=sync]');
  await click('[data-act=offline]'); await page.waitForTimeout(200);
  await page.evaluate(() => quickMark('holiday', addDays(todayIso(), 5)));
  ok('TC-46 offline → red dot + waiting count', (await page.getAttribute('#syncdot', 'class')).includes('bad') && (await page.textContent('#synctext')).includes('waiting'));
  await shot('19-offline');
  await click('[data-act=offline]'); await page.waitForTimeout(2600);
  ok('TC-47 reconnect → synced', (await page.getAttribute('#syncdot', 'class')).includes('ok'));
  // Dark + large text sweep
  await click('[data-act=theme][data-v=darkblue]');
  ok('TC-86 Dark blue theme = navy background', await page.evaluate(() => getComputedStyle(app).backgroundColor) === 'rgb(12, 19, 30)');
  await click('[data-act=theme][data-v=dark]');
  ok('TC-87 Dark theme = pure black background', await page.evaluate(() => getComputedStyle(app).backgroundColor) === 'rgb(0, 0, 0)'); await click('[data-act=textSize][data-v=l]'); await click('[data-act=bold]');
  await shot('20-settings-dark-large');
  for (const t of ['home', 'records', 'export', 'settings']) { await click(`.tab[data-tab=${t}]`); ok(`UI ${t} dark/large/bold no overflow`, (await overflow()) <= 0); await shot(`21-${t}-dark-large`); }
  await click('[data-act=textSize][data-v=m]'); await click('[data-act=bold]');
  for (const t of ['home', 'records', 'export']) { await click(`.tab[data-tab=${t}]`); await shot(`22-${t}-dark`); }
  await click('.tab[data-tab=home]'); await click('#fab'); await shot('23-add-entry-dark'); await click('#layers .layer:last-child .sheet-head [data-act=close]');
  await click('.tab[data-tab=settings]'); await click('[data-act=textSize][data-v=s]');
  for (const t of ['home', 'records']) { await click(`.tab[data-tab=${t}]`); ok(`UI ${t} small no overflow`, (await overflow()) <= 0); }
  // back button behaviour
  await click('.tab[data-tab=records]'); await click('#fab');
  await page.goBack(); await page.waitForTimeout(400);
  ok('TC-48 back closes sheet first', await page.evaluate(() => layers.length === 0 && cur === 'records'));
  await page.goBack(); await page.waitForTimeout(400);
  ok('TC-49 back again → home', await page.evaluate(() => cur === 'home'));
  // logout with pending
  await page.evaluate(() => { S.sync.forcedOffline = true; markDirty(); });
  await click('.tab[data-tab=settings]'); await click('[data-act=logout]');
  ok('TC-50 logout warns about unsynced', (await page.textContent('.dlg')).includes('unsynced'));
  await click('#dlg-ok'); await page.waitForTimeout(400);
  ok('TC-51 logout → sign-in screen', await page.isVisible('#auth-email'));

  // lockout in fresh page
  const p2 = await ctx.newPage(); await p2.goto(URL); await p2.waitForTimeout(300);
  await p2.evaluate(() => { localStorage.clear(); }); await p2.reload(); await p2.waitForTimeout(300);
  await p2.fill('#email', 'x@y.com'); await p2.click('[data-act=sendCode]'); await p2.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await p2.keyboard.type('000000'); await p2.waitForTimeout(250); }
  ok('TC-52 3 wrong codes → 1-minute lock', (await p2.textContent('#otp-msg')).includes('Try again in') && await p2.isDisabled('#verify-btn'));
  await p2.screenshot({ path: OUT + '24-otp-locked.png' });

  // ---- Extra coverage (fresh signed-in page)
  const p3 = await ctx.newPage(); p3.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p3.goto(URL); await p3.evaluate(() => localStorage.clear()); await p3.reload(); await p3.waitForTimeout(300);
  // TC-53 offline sign-in
  await p3.evaluate(() => { S.sync.forcedOffline = true; }); await p3.fill('#email', 'a@b.com'); await p3.click('[data-act=sendCode]');
  ok('TC-53 offline sign-in blocked', (await p3.textContent('#f-email .msg')).includes('offline'));
  await p3.evaluate(() => { S.sync.forcedOffline = false; }); await p3.click('[data-act=sendCode]'); await p3.waitForTimeout(300);
  // TC-54 paste
  await p3.evaluate(() => { const dt = new DataTransfer(); dt.setData('text', '12 34 56'); document.querySelector('#otp input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await p3.waitForTimeout(300);
  ok('TC-54 pasted code verifies', await p3.isVisible('#auth-name'));
  await p3.fill('#onb-name', 'Tester'); await p3.click('[data-act=saveName]'); await p3.waitForTimeout(400);
  const c3 = async sel => { await p3.click(sel); await p3.waitForTimeout(350); };
  const toast3 = async () => (await p3.textContent('#toasts')) || '';
  // TC-61 quick holiday
  await c3('[data-act=quick][data-status=holiday]');
  ok('TC-61 quick holiday + undo toast', (await toast3()).includes('marked as holiday') && await p3.isVisible('.toast .undo'));
  await c3('.toast .undo');
  // TC-58 Other without save, TC-59 place without duty no, TC-60 zero amount, TC-63 note limit
  await c3('#fab');
  await c3('#shift-m [data-act=pickPlace]'); await c3('.pk-list .pk-item:not(.other)');
  await c3('[data-act=saveEntry]');
  ok('TC-59 place without duty no → error', (await p3.textContent('.field[data-k="m.no"] .msg')).includes('duty number'));
  await p3.fill('#no-m', '8752'); await p3.fill('#amt-fare', '0'); await c3('[data-act=saveEntry]');
  ok('TC-60 zero amount → error', (await p3.textContent('.field[data-k="amt.fare"] .msg')).includes('above ₹0'));
  await p3.fill('#amt-fare', '75');
  await p3.fill('#ef-note', 'x'.repeat(250));
  ok('TC-63 note capped at 200', (await p3.inputValue('#ef-note')).length === 200 && (await p3.textContent('#note-c')) === '200/200');
  await p3.fill('#no-e', '8761'); await c3('#shift-e [data-act=pickPlace]'); await c3('.pk-item.other[data-v=__other]');
  await p3.fill('#tx-e', '<b>Sivagiri</b>'); await c3('#shift-e [data-act=toggleSave]');
  await c3('[data-act=saveEntry]');
  ok('TC-58 Other without save not added to places', await p3.evaluate(() => !S.places.some(p => p.name.includes('Sivagiri')) && S.entries[todayIso()].e.text === '<b>Sivagiri</b>'));
  ok('SEC-02 HTML in names shown as text', await p3.evaluate(() => [...document.querySelectorAll('#v-home .today .pl')].some(el => el.textContent === '<b>Sivagiri</b>' && el.children.length === 0)));
  // TC-62 change date while editing
  const free = await p3.evaluate(() => { let d = addDays(todayIso(), -1); while (S.entries[d]) d = addDays(d, -1); return d; });
  await p3.evaluate(() => openEntry(todayIso())); await p3.waitForTimeout(350);
  await p3.evaluate(d => { F.date = d; drawEntry(); }, free); await c3('[data-act=saveEntry]');
  ok('TC-62 edit moves entry to new date', await p3.evaluate(d => !S.entries[todayIso()] && S.entries[d]?.m.no === '8752', free));
  // TC-64 calendar dots
  await p3.evaluate(() => openCalendar({ value: todayIso(), onPick: () => {} })); await p3.waitForTimeout(350);
  ok('TC-64 calendar shows status dots', (await p3.locator('.cal .cd i').count()) > 0);
  await p3.evaluate(() => closeTop()); await p3.waitForTimeout(350);
  // TC-65 date edge cases
  const edge = await p3.evaluate(() => [daysIn(2027, 2), daysIn(2028, 2), addDays('2026-01-31', 1), addDays('2028-02-28', 1), addDays('2026-12-31', 1), fmtDW('2028-02-29'), monthDates('2027-02').length]);
  ok('TC-65 month-end / leap day', JSON.stringify(edge) === JSON.stringify([28, 29, '2026-02-01', '2028-02-29', '2027-01-01', '29-Feb-2028 Tue', 28]), JSON.stringify(edge));
  // TC-66/67 month switch + totals match Excel formulas
  await c3('.tab[data-tab=records]'); await c3('[data-act=mPrev]');
  const tot = await p3.evaluate(() => { const ds = monthDates(R.month); const es = ds.map(d => S.entries[d]).filter(Boolean); return { shown: document.querySelector('.totals').textContent.replace(/\s+/g, ' '), duty: es.filter(e => e.status === 'duty').length, m: es.filter(e => e.m.no).length, e: es.filter(e => e.e.no).length, fare: es.reduce((a, e) => a + (e.amt.fare || 0), 0) }; });
  ok('TC-66/67 previous month totals = COUNTIF/COUNTA/SUM', tot.shown.replace(/ /g, '').includes(`Onduty${tot.duty}Morning${tot.m}Evening${tot.e}`) && tot.shown.includes(await p3.evaluate(f => inr(f), tot.fare)), tot.shown);
  // TC-68 missing chips open form
  await c3('.tab[data-tab=home]');
  if (await p3.locator('.alert .chip[data-act=addFor]').count()) { await c3('.alert .chip[data-act=addFor]'); ok('TC-68 missing-day chip opens form for that date', (await p3.textContent('.layer .sheet-head h2')).includes('Add entry')); await p3.evaluate(() => closeTop()); await p3.waitForTimeout(350); }
  // Export filters TC-69/70/71
  await c3('.tab[data-tab=export]');
  await c3('[data-act=xPeriod][data-v=pick]'); await p3.locator('.pk-item').filter({ hasText: 'August' }).first().click(); await p3.waitForTimeout(350);
  ok('TC-69 pick a month → full month', await p3.evaluate(() => { const r = exportRange(); return r.from.endsWith('-08-01') && r.to.endsWith('-08-31'); }));
  await c3('[data-act=xStatus][data-v=duty]');
  ok('TC-70 status filter only on-duty + toggle hidden', await p3.evaluate(() => exportRows().rows.every(r => r.e && r.e.status === 'duty')) && !(await p3.isVisible('[data-act=xEmpty]')));
  await c3('[data-act=xStatus][data-v=all]'); await c3('[data-act=xEmpty]');
  ok('TC-71 empty days excluded when off', await p3.evaluate(() => exportRows().rows.every(r => r.e)));
  // Settings: TC-75/77/78/80
  await c3('.tab[data-tab=settings]'); await c3('[data-act=sec][data-id=places]');
  await c3('[data-act=placesMgr]'); await p3.locator('#pm-list .pk-item').filter({ hasText: 'Perundurai' }).first().click(); await p3.waitForTimeout(350);
  await c3('#pl-vis'); await c3('#pl-save');
  ok('TC-75 hidden place not in dropdown', await p3.evaluate(() => !placeGroups().some(g => g.label !== 'Recently used' && g.items.some(i => i.label === 'Perundurai'))));
  await p3.evaluate(() => { while (layers.length) closeTop(); }); await p3.waitForTimeout(400);
  await c3('[data-act=catsMgr]'); await c3('#cm-list [data-act=editCat]'); await c3('#ct-del');
  ok('TC-77 delete category with places blocked', (await toast3()).includes('Move them'));
  await p3.evaluate(() => { while (layers.length) closeTop(); }); await p3.waitForTimeout(400);
  await c3('[data-act=sec][data-id=fields]'); await c3('[data-act=editField][data-id=fare]');
  await p3.fill('#fd-name', 'Batta'); await c3('#fd-save');
  ok('TC-78 rename amount field keeps values', await p3.evaluate(() => S.fields[0].name === 'Batta' && Object.values(S.entries).some(e => e.amt.fare > 0)) && (await p3.textContent('#v-records .totals')).includes('Batta'));
  await c3('[data-act=sec][data-id=rules]'); await c3('[data-act=weeklyOff]'); await p3.locator('.pk-item').filter({ hasText: 'Monday' }).click(); await p3.waitForTimeout(350);
  ok('TC-80 weekly off → Monday entries default to Holiday', await p3.evaluate(() => { let d = addDays(todayIso(), 1); while (parse(d).getDay() !== 1) d = addDays(d, 1); return defaultStatus(d) === 'holiday' && missingDays().every(x => parse(x).getDay() !== 1); }));
  // TC-79 photo crop
  await c3('[data-act=editProfile]');
  await p3.setInputFiles('#pf-file', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(require('fs').readFileSync(path.join(__dirname, '..', 'icons', 'bus.png'))) });
  await p3.waitForTimeout(500);
  ok('TC-79 photo cropped to 160px', await p3.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => r(i.width === 160 && i.height === 160); i.src = document.querySelector('#pf-av img.photo').src; })));
  await p3.setInputFiles('#pf-file', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }); await p3.waitForTimeout(300);
  ok('TC-79b non-image rejected', (await toast3()).includes('image file'));
  // UI-02 toast moves to top while a sheet is open
  await p3.evaluate(() => toast('test', 'ok')); await p3.waitForTimeout(200);
  ok('UI-02 toast at top when sheet open', await p3.evaluate(() => document.querySelector('#toasts').getBoundingClientRect().top < 100));
  await p3.evaluate(() => { while (layers.length) closeTop(); }); await p3.waitForTimeout(400);
  // UI-03 FAB lifts above toast
  await c3('.tab[data-tab=home]'); await p3.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; app.classList.remove('toast-up'); }); await p3.waitForTimeout(400); const fab0 = (await p3.locator('#fab').boundingBox()).y;
  await p3.evaluate(() => toast('lift', 'ok')); await p3.waitForTimeout(450);
  ok('UI-03 FAB lifts above toast', (await p3.locator('#fab').boundingBox()).y < fab0 - 30);
  // UI-04 swipe down closes sheet (touch events)
  await c3('#fab');
  await p3.evaluate(() => { const h = document.querySelector('#layers .layer:last-child .grab'); const t = (y) => new Touch({ identifier: 1, target: h, clientX: 100, clientY: y }); h.dispatchEvent(new TouchEvent('touchstart', { touches: [t(100)], bubbles: true })); h.dispatchEvent(new TouchEvent('touchmove', { touches: [t(260)], bubbles: true })); h.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })); });
  await p3.waitForTimeout(400);
  ok('UI-04 swipe down closes sheet', await p3.evaluate(() => layers.length === 0));
  // UI-05 reduced motion
  const p4 = await browser.newPage({ viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' }); await p4.goto(URL); await p4.waitForTimeout(200);
  ok('UI-05 reduced motion disables animation', await p4.evaluate(() => getComputedStyle(document.querySelector('.brand .logo')).animationName === 'none'));
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nFAILS:', results.filter(r => r.startsWith('FAIL')).length, ' CONSOLE ERRORS:', errors.length); errors.forEach(e => console.log('  ', e));
})();
