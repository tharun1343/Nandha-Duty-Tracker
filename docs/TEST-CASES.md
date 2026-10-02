# Daily Duty Tracker — Test cases

Living document. Every feature or bug fix adds cases here.

Two test suites:
- `prototype/tests/prototype.e2e.js` checks the clickable prototype.
- `tests/` checks the real app. It has 6 unit tests for the sync engine (`npm test`) and an end-to-end run of the built app against a fake Supabase (`npm run e2e`, 109 checks). Both run in GitHub Actions on every push.

**Status column**
- **Pass (auto)**: checked by `prototype/tests/prototype.e2e.js` at 360 × 780 px (Playwright).
- **Pass (visual)**: checked by eye on screenshots, in light and dark themes.
- **Not run yet**: written down, not yet exercised.
- **Build**: can only be tested in the real app (Supabase, Android APK, real phone).

Last prototype run: 96 automated checks, 0 failures, no app console errors. The only console error was Google Fonts being blocked by the test sandbox's network proxy.

---

## Auth and accounts

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-01 | Auth | First open | Open app with no session | Sign-in screen with email field | High | Pass (auto) |
| TC-02 | Auth | Empty email | Tap **Send code** with nothing typed | Field highlighted, "Enter your email" | High | Pass (auto) |
| TC-03 | Auth | Invalid email | Type `abc@` → Send code | "Enter a valid email…" | High | Pass (auto) |
| TC-04 | Auth | Valid email | Type a valid email → Send code | Code step shown, toast "Code sent" | High | Pass (auto) |
| TC-05 | Auth | Resend cooldown | On code step | "Resend in 60s" counts down; button disabled until 0 | Medium | Pass (auto) |
| TC-06 | Auth | Wrong code | Enter `000000` (prototype's wrong code) | Boxes shake and clear, "Wrong code. 2 attempts left." | High | Pass (auto) |
| TC-07 | Auth | Auto-submit | Type 6 digits | Verifies on the last digit, no tap needed | High | Pass (auto) |
| TC-52 | Auth | Lockout | 3 wrong codes | "Too many wrong codes. Try again in 1:00", inputs and Verify disabled for 1 minute | High | Pass (auto) |
| TC-08 | Onboarding | Name required | Tap Continue with empty name | "Enter your name" | High | Pass (auto) |
| TC-09 | Onboarding | Finish onboarding | Enter name → Continue | Home screen, "Welcome, <name>" toast | High | Pass (auto) |
| TC-53 | Auth | Offline sign-in | Turn on offline → Send code | "You are offline. Connect to the internet…" | Medium | Pass (auto) |
| TC-54 | Auth | Paste code | Paste a 6-digit code into the first box | All boxes filled and verified | Medium | Pass (auto) |
| TC-50 | Auth | Log out with unsynced changes | Make a change offline → Log out | Warning names how many changes haven't uploaded | High | Pass (auto) |
| TC-51 | Auth | Log out | Confirm log out | Back to sign-in, email pre-filled | High | Pass (auto) |
| TC-55 | Auth | Real email code | Sign in with a real inbox | Email arrives with a 6-digit code; expired code rejected | High | Build |
| TC-56 | Auth | New device | Sign in on a second phone | Existing entries download before Home shows | High | Build |
| TC-57 | Auth | Session expiry | Session expires mid-use | Re-sign-in; local unsynced entries are kept | High | Build |

## Daily entry (add / edit / delete)

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-11 | Entry | Open form | Tap **+** | "Add entry" sheet, today's date, status from weekday (weekly off → Holiday) | High | Pass (auto) |
| TC-12 | Entry | Nothing filled | On duty → **Add entry** | "Add a morning or evening duty number, or an amount." and summary "Please fix…" | High | Pass (auto) |
| TC-13 | Entry | Duty number digits only | Type `87a52x` | Field shows `8752`; max 6 digits | High | Pass (auto) |
| TC-14 | Entry | Place search | Place dropdown → type "bhav" | Only Bhavani shown | Medium | Pass (auto) |
| TC-15 | Entry | Pick place | Tap a place | Place shown in the field | High | Pass (auto) |
| TC-16 | Entry | Other place | Dropdown → **Other (type manually)** | "Place name" input + "Save to my places" (on by default) | High | Pass (auto) |
| TC-17 | Entry | Other place left blank | Save with Other selected and no name | "Type the place name…" | High | Pass (auto) |
| TC-22 | Entry | Other + save | Type a new place, keep "Save" ticked, save | Place added to Settings → Places (Uncategorised) | High | Pass (auto) |
| TC-58 | Entry | Other without save | Untick "Save", save | Name stored on the entry only, not in Places | Medium | Pass (auto) |
| TC-59 | Entry | Place without duty number | Pick a place, leave duty no. empty | "Enter the duty number" | Medium | Pass (auto) |
| TC-18 | Entry | Money decimals | Type `1234.567` | Shows `1,234.56` (2 decimals max) | High | Pass (auto) |
| TC-19 | Entry | Indian grouping | Type `100000` | Shows `1,00,000`; max ₹1,00,000 | High | Pass (auto) |
| TC-60 | Entry | Zero amount | Type `0` | "Enter an amount above ₹0, or leave it empty" | Medium | Pass (auto) |
| TC-20 | Entry | Save | Fill and tap **Add entry** | Sheet closes, toast "Entry added · <date>" with Undo | High | Pass (auto) |
| TC-21 | Entry | Appears everywhere | After save | Home today card, Records row, monthly totals and Export preview all update | High | Pass (auto) |
| TC-23 | Entry | Undo add | Tap Undo on the toast | Entry and any place it created are removed | High | Pass (auto) |
| TC-24 | Entry | Duplicate date | Pick a date that already has an entry | Warning with **Edit it** button; save is blocked | High | Pass (auto) |
| TC-25 | Entry | Future on-duty | Date in future + On duty | "On-duty entries can't be in the future…" | High | Pass (auto) |
| TC-26 | Entry | Plan leave ahead | Date in future + Leave | Saves | Medium | Pass (auto) |
| TC-27 | Entry | Repeat last duty | Home → **Repeat last duty** | Form pre-filled from last on-duty day; user checks and saves | Medium | Pass (auto) |
| TC-61 | Entry | Quick holiday/leave | Home → **Holiday** or **Leave** | Today marked, toast with Undo | Medium | Pass (auto) |
| TC-32 | Entry | Edit | Tap a filled Records row | "Edit entry", all fields pre-filled, button "Update entry" | High | Pass (auto) |
| TC-33 | Entry | Delete | Edit → 🗑 → confirm | Confirm dialog shows date, status, duties, amount; entry removed | High | Pass (auto) |
| TC-34 | Entry | Undo delete | Tap Undo | Entry restored exactly | High | Pass (auto) |
| TC-62 | Entry | Change date while editing | Edit → change date to a free date → Update | Old date emptied, new date has the entry | Medium | Pass (auto) |
| TC-63 | Entry | Note limit | Type a long note | Stops at 200 characters, counter shows 200/200 | Low | Pass (auto) |
| TC-64 | Entry | Calendar dots | Open date picker | Days with entries show green / pink / amber dots | Low | Pass (auto) |
| TC-65 | Entry | Month-end and leap day | Add entries on 31-Jan, 28/29-Feb, 31-Dec | Dates and month totals correct | Medium | Pass (auto) |

## Records

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-28 | Records | Month list | Open Records | One row per day of the month, like the Excel sheet | High | Pass (auto) |
| TC-29 | Records | "No entry" filter | Tap **No entry** chip | Only past working days without an entry | Medium | Pass (auto) |
| TC-30 | Records | Search | Type "Erode" | Rows filtered, keyboard stays open | Medium | Pass (auto) |
| TC-31 | Records | Search with no match | Type "zzzz" | Empty state with **Show all days** | Low | Pass (auto) |
| TC-66 | Records | Month switch | ‹ › or tap month name | Month changes; totals bar recalculates | High | Pass (auto) |
| TC-67 | Records | Totals bar | Any month | On duty / Morning / Evening / amount match the Excel TOTALS row formulas | High | Pass (auto) |
| TC-68 | Home | Missing days card | Leave past working days blank | "N days without an entry" with date chips that open the form | Medium | Pass (auto) |

## Export

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-35 | Export | Bad custom range | From after To | Error shown, download buttons disabled | High | Pass (auto) |
| TC-36 | Export | Last 30 days | Choose Last 30 days | Preview says 30 rows | High | Pass (auto) |
| TC-69 | Export | Pick a month | Pick a month → choose August | Range 01-Aug → 31-Aug | High | Pass (auto) |
| TC-70 | Export | Status filter | Choose On duty | Only on-duty rows; empty-days toggle hidden | Medium | Pass (auto) |
| TC-71 | Export | Include empty days | Toggle off | Days with no entry left out | Medium | Pass (auto) |
| TC-37 | Export | CSV | Download CSV | Header + one row per day; ₹ amounts; opens in Excel (UTF-8 BOM) | High | Pass (auto) |
| TC-83 | Export | Save inside claude.ai | Tap a download on the shared page | Viewer asks to confirm the file name; Cancel → "Download cancelled" toast | High | Not run yet (needs the claude.ai viewer) |
| TC-72 | Export | PDF | Download PDF | Real A4 PDF: navy title; Name / Staff ID / Depot / Period block in the sheet's TOTALS colours (light-blue labels, pale-blue values); blue header; pink Sundays with red "Holiday"; amber leave; two-row TOTALS like the sheet; no legend | High | Pass (auto) + visual |
| TC-84 | Export | No legend | Export PDF / Excel | No legend line in either file | High | Pass (auto) |
| TC-85 | Export | Print area | Export a month as PDF | Whole sheet inside the top-left 60% of the A4 width and height; rest of the page blank for cutting; font shrinks (9 → 6 pt) to fit; ranges longer than a month continue on more pages inside the same area | High | Pass (auto) |
| TC-73 | Export | Excel | Download Excel | Real .xlsx: same colours, separate place columns, numbers as numbers, live `COUNTIF`/`COUNTA`/`SUM` totals like the original sheet; blank cells left empty | High | Pass (auto) |
| TC-74 | Export | Real files on phone | Export on Android | File saved/shared (WhatsApp, Files) | High | Build |

## Settings, places, categories

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-38 | Settings | Sections collapsed | Open Settings | All collapsed; opened ones remembered | Low | Pass (auto) |
| TC-39 | Places | Delete place in use | Edit a used place → 🗑 | Blocked: "used in N entries. Rename it, or turn off Show in dropdown" | High | Pass (auto) |
| TC-40 | Places | Duplicate name | Add "erode" when "Erode" exists | "You already have a place with this name" | Medium | Pass (auto) |
| TC-41 | Places | Add with icon | Name + category + icon | Place in dropdown under its category | High | Pass (auto) |
| TC-75 | Places | Hide place | Turn off "Show in Place dropdown" | Not offered in the form; old entries keep the name | Medium | Pass (auto) |
| TC-76 | Categories | Add/rename | Add "Depots" with an icon | Appears as a group in the Place dropdown | Medium | Not run yet |
| TC-77 | Categories | Delete category with places | 🗑 on a category that has places | Blocked with reason | Medium | Pass (auto) |
| TC-42 | Amounts | Turn on second amount field | Toggle Paramount on | New field in the form, Records totals and exports | High | Pass (auto) |
| TC-43 | Amounts | Last field | Turn off the only field | Blocked: "Keep at least one amount field switched on" | Medium | Pass (auto) |
| TC-78 | Amounts | Rename field | Tap Bus Fare → rename | Label changes everywhere, values kept | Medium | Pass (auto) |
| TC-44 | Profile | Invalid mobile | Mobile `12345` | "Enter a 10-digit mobile number" | Medium | Pass (auto) |
| TC-45 | Profile | Update | Name, ID, depot → Update profile | Saved; printed on exports | Medium | Pass (auto) |
| TC-79 | Profile | Photo | Upload a large photo | Cropped to a 160 px square; non-images rejected | Low | Pass (auto) |
| TC-80 | Rules | Weekly off | Change weekly off to Monday | New Monday entries start as Holiday; missing-day count updates | Medium | Pass (auto) |

## Offline and sync

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-10 | Sync | Synced | After changes while online | Dot orange "Syncing…" then green "Synced" | High | Pass (auto) |
| TC-46 | Sync | Offline | Turn on offline → add entry | Red dot, "Offline · N waiting" | High | Pass (auto) |
| TC-47 | Sync | Reconnect | Turn offline off | Uploads automatically → green | High | Pass (auto) |
| TC-81 | Sync | Two phones edit same day | Edit 05-Oct on two phones | Newest edit wins; nothing silently lost | High | Build |
| TC-82 | Sync | Airplane mode for a week | Enter 7 days offline, reconnect | All 7 upload in order | High | Build |

## UI and accessibility

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| UI-01 | UI | No horizontal overflow | All tabs at 360 px; light, dark; Small/Medium/Large; bold on/off | No sideways scroll, no clipped text | High | Pass (auto) |
| TC-86 | UI | Dark blue theme | Settings → Appearance → Dark blue | Navy background (the original dark look) | Medium | Pass (auto) |
| TC-87 | UI | Dark theme | Settings → Appearance → Dark, or System on a dark phone | Pure black background | High | Pass (auto) |
| TC-48 | UI | Back closes sheet first | Open a sheet → Back | Sheet closes, tab unchanged | High | Pass (auto) |
| TC-49 | UI | Back → Home | Back again | Goes to Home | High | Pass (auto) |
| UI-02 | UI | Toast position | Toast while a sheet is open | Toast moves to top so it never covers the sheet's button | Medium | Pass (auto) |
| UI-03 | UI | FAB lifts | Toast on Home/Records | **+** moves above the toast | Low | Pass (auto) |
| UI-04 | UI | Swipe to close | Drag a sheet's handle down | Sheet closes | Medium | Pass (auto) |
| UI-05 | UI | Reduced motion | OS reduced-motion on | Animations off | Low | Pass (auto) |
| UI-06 | UI | Portrait lock | Rotate phone | Stays portrait | Low | Build |

## Security

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| SEC-01 | Export | CSV formula injection | Place/note starting with `=`, `+`, `-`, `@` | Cell prefixed with `'` so Excel shows text | High | Pass (auto) |
| SEC-02 | UI | HTML in names | Place named `<b>x</b>` | Shown as text everywhere | High | Pass (auto) |
| SEC-03 | Data | Row-level security | User A queries user B's entries | 0 rows returned | High | Build |
| SEC-04 | Secrets | Keys in repo | Search repo and app bundle | Only the public (anon) key; no service key, no passwords | High | Build |
| SEC-05 | Auth | Code brute force | Many wrong codes | Client lock (3 tries) + Supabase rate limit | High | Build |
| SEC-06 | Auth | Account enumeration | Sign in with unknown email | Same "Code sent" message as a known email | Medium | Build |

---

## Real app: sync, sign-in, updates (end-to-end against a fake Supabase)

| ID | Area | Scenario | Steps | Expected result | Priority | Status |
|---|---|---|---|---|---|---|
| TC-55 | Auth | Code email requested | Enter email → Send code | One request to Supabase `/auth/v1/otp` | High | Pass (auto) |
| TC-56 | Auth | New phone, existing account | Sign in on a fresh phone | Account data downloads first; Home opens with the existing name and entries (no onboarding) | High | Pass (auto) |
| TC-07 | Auth | Account without a name | Sign in to an account with data but no name | Data downloads, then the name step appears | High | Pass (auto) |
| TC-47b | Sync | Offline entry uploads | Add an entry offline → reconnect | Entry stored on the server | High | Pass (auto) |
| TC-81 | Sync | Second phone | Sign in to the same account on another phone | Same entries, places and profile | High | Pass (auto) |
| TC-81b | Sync | Edit on phone B | Edit a day on B, sync A | A shows B's (newer) edit | High | Pass (auto) |
| TC-81c | Sync | Delete on phone A | Delete a day on A, sync B | Day removed on B (tombstone) | High | Pass (auto) |
| TC-88 | Sync | Server error | Server returns 500 | Red dot "Sync failed", change kept; next sync succeeds | High | Pass (auto) |
| TC-57 | Auth | Log out with unsynced change, sign in again | Offline change → log out → sign in | Change kept on the phone and uploaded after sign-in | High | Pass (auto) |
| TC-89 | Updates | New version | `version.json` shows a newer minor version | Home banner with **Update now / Later** | High | Pass (auto) |
| TC-90 | Updates | Later | Tap Later | Banner hidden for 24 h for that version | Medium | Pass (auto) |
| TC-91 | Updates | Major version | `version.json` shows a newer major version | Full-screen "Update required" | High | Pass (auto) |
| U-01…06 | Sync engine | Unit tests | `npm test` | First sync up/down; week offline then upload; tombstones; two-phone conflicts (newest wins); first sign-in keeps newer local entries but never overwrites the account with blank defaults; field order and settings round-trip | High | Pass (auto) |
| SEC-03 | Data | Row-level security | Ran `supabase/schema.sql` on PostgreSQL 16 with Supabase-style roles | User B sees 0 of A's rows and can't update them; A can't insert rows for B; hard delete denied; anon denied; older edit ignored; schema re-runnable | High | Pass (local PostgreSQL); recheck on the real project after setup |
| SEC-04 | Secrets | Keys in repo | Search repo | Only public config via GitHub variables; signing key only in GitHub Secrets; `.env`, `*.jks` git-ignored | High | Pass (visual) |
| SEC-07 | Web | Content-Security-Policy | Built app | Scripts, styles, fonts and images from the app only; network only to the Supabase project and the update URL; no CSP errors during the e2e run | High | Pass (auto) |

## Needs a real phone (APK) — not yet run
| ID | Area | Scenario | Expected result |
|---|---|---|---|
| APK-01 | Install | Install `duty-tracker.apk` | Installs; icon "Duty Tracker"; opens in portrait only |
| APK-02 | Back button | Android back with a sheet open → again → again | Closes the sheet, then goes to Home, then exits |
| APK-03 | Export | Download PDF / Excel / CSV | Android share sheet opens (Save to Files / Drive / WhatsApp); the file opens correctly |
| APK-04 | Reminder | Settings → Reminder on, time 8:00 PM | Notification asks permission; reminder appears only on duty days without an entry; tapping it opens Add entry for that day |
| APK-05 | Update | Install a newer build over the old one (signed) | Installs over it; entries kept |
| APK-06 | Real Supabase | Sign in with your real email | Code email arrives (template contains the code); entries sync to the Supabase table |

Some phone brands stop background work to save battery, which can delay reminder notifications. If that happens, set the app's battery setting to "Unrestricted".

## Not testable in the prototype
- Real email codes, real cloud sync, two-device conflicts (needs Supabase).
- Real file saving and sharing on Android, portrait lock, the hardware back button (needs the APK on a phone).
- PDF and Excel files are made with jsPDF and ExcelJS, loaded from cdnjs the first time you export, so the prototype needs internet for those two. The real app will bundle them so exports work offline.
