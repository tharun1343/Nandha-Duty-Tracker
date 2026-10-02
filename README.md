# Daily Duty Tracker

A mobile app that replaces the printed Excel duty sheet (`Duty_Tracker_2026.xlsx` / `Duty_Tracker_2027.xlsx`). Enter each day's morning and evening duty number, place and bus fare, then export any month or date range as a PDF, Excel or CSV file in the same layout as the sheet.

**Current phase: Prototype** (see `APP-BUILD-PLAYBOOK.md` phases). The real build starts after the prototype is approved.

| Path | What it is |
|---|---|
| `prototype/index.html` | Clickable prototype with sample data. Open it in a browser at phone width |
| `prototype/icons/`, `prototype/icons.js` | Microsoft Fluent 3D emoji (MIT), bundled locally. Rebuild with `python3 prototype/build_icons.py` |
| `prototype/tests/prototype.e2e.js` | Playwright click-through (88 checks): `node prototype/tests/prototype.e2e.js` |
| `prototype/tools/make_artifact.py` | Bundles the prototype into one self-contained HTML file |
| `docs/TEST-CASES.md` | Living test-case document |

## Planned stack (build phase)
Vite + vanilla JS, Capacitor for the Android APK, and Supabase (Postgres + email-code sign-in + row-level security). Data is saved on the phone first and syncs when online. GitHub Actions builds the APK and the web version.
