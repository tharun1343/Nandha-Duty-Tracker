# Daily Duty Tracker

A mobile app that replaces the printed Excel duty sheet (`Duty_Tracker_2026.xlsx` / `Duty_Tracker_2027.xlsx`). Enter each day's morning and evening duty number, place and bus fare, then export any month or date range as a PDF, Excel or CSV file in the same layout as the sheet.

**Current phase: Build.** The prototype was approved; the real app is in `src/` + `android/`. Setup steps: [`docs/SETUP.md`](docs/SETUP.md).

| Path | What it is |
|---|---|
| `prototype/index.html` | Clickable prototype with sample data. Open it in a browser at phone width |
| `prototype/icons/`, `prototype/icons.js` | Microsoft Fluent 3D emoji (MIT), bundled locally. Rebuild with `python3 prototype/build_icons.py` |
| `prototype/tests/prototype.e2e.js` | Playwright click-through (96 checks): `node prototype/tests/prototype.e2e.js`. Set `LIB_DIR=<node_modules>` to serve exceljs/jspdf locally when cdnjs is blocked |
| `prototype/tools/make_artifact.py` | Bundles the prototype into one self-contained HTML file |
| `docs/TEST-CASES.md` | Living test-case document |
| `src/`, `index.html` | The app (Vite + vanilla JS), ported from the prototype |
| `android/` | Capacitor Android project (portrait, signed release builds in CI) |
| `supabase/schema.sql` | Database table, row-level security, newest-edit-wins trigger |
| `tests/unit/` | Sync engine tests: `npm test` |
| `tests/e2e/` | Built app vs. a fake Supabase (109 checks): `npm run e2e` |
| `.github/workflows/android.yml` | Tests → APK → GitHub Release on every push |

## Stack
Vite + vanilla JS, Capacitor for the Android APK, and Supabase (Postgres + email-code sign-in + row-level security). Data is saved on the phone first and syncs when online. GitHub Actions builds the APK and the web version.
