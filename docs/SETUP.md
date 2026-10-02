# Setup: Supabase, GitHub and installing the app

You only do this once. Steps marked **(you)** happen in a dashboard; nothing here needs a password to be sent to anyone.

## 1. Supabase project (you)

1. Go to **supabase.com → Dashboard → New project**.
   - Name: `duty-tracker`
   - Region: **South Asia (Mumbai)**
   - Database password: choose one and keep it yourself. The app never needs it.
2. When the project is ready: **SQL Editor → New query**. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql), then press **Run**. You should see *Success. No rows returned*. This creates the `records` table and the public `releases` bucket for app updates. If you ran an older copy before, run this one again; that is safe.
3. **Authentication → Sign In / Providers → Email**:
   - **Enable Email provider**: on
   - **Email OTP Length**: `6`
   - **Email OTP Expiration**: `600` seconds (10 minutes)
4. **Authentication → Emails → Templates**. In both **Confirm signup** and **Magic Link**, replace the message body with:

   ```html
   <h2>Your Duty Tracker sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
   ```

   The app signs in with this 6-digit code. Without `{{ .Token }}` the email only has a link, and the app can't use it.
5. **Project Settings → API Keys**: copy the **Project URL** and the **anon / publishable** key.
   - These two are public and safe to put in the app.
   - Never copy the **service_role / secret** key anywhere.

> Supabase's built-in email sender only allows a few emails per hour. That's fine for one person. If several people sign in often, add your own SMTP under **Authentication → Emails → SMTP Settings**.

## 2. GitHub settings (you)

The project URL and publishable key are already in the repo (`.env.production`). Nothing else from Supabase goes into the code.

Open **github.com/tharun1343/Nandha-Duty-Tracker → Settings → Secrets and variables → Actions → Secrets** tab, and click **New repository secret** for each of these:

| Name | Where the value comes from |
|---|---|
| `ANDROID_KEY_ALIAS` | `android-signing-secrets.txt` (the file you were sent) |
| `ANDROID_KEYSTORE_PASSWORD` | same file |
| `ANDROID_KEY_PASSWORD` | same file |
| `ANDROID_KEYSTORE_BASE64` | same file (one long line) |
| `SUPABASE_SECRET_KEY` | Supabase → **Project Settings → API Keys → Secret keys** → copy the `sb_secret_…` key (if you only see the older keys, use **service_role**) |

- **Signing secrets:** they let every new version install over the old one and keep your data. Without them, builds are debug-signed, and you'd have to uninstall before each update.
- **`SUPABASE_SECRET_KEY`:** lets the pipeline upload new versions to your Supabase `releases` bucket. Only GitHub Actions uses it, and it never goes into the app.

After saving, run a new build: **Actions → Build app → Run workflow**.

## How updates reach the phone (the pipeline)

Every push to the repository's default branch (now `claude/beautiful-brown-lp8zwg`; later `main`) does the following:
1. Runs the tests (sync engine plus the end-to-end test of the whole app). If anything fails, nothing is published.
2. Builds a signed APK numbered `1.0.N`, where `N` is the GitHub Actions run number.
3. Publishes it on **GitHub Releases** as `v1.0.N`.
4. Uploads it to the public Supabase bucket `releases`:
   - `duty-tracker-1.0.N.apk`
   - `duty-tracker-latest.apk`, a fixed download link that needs no GitHub login
   - `version.json`
5. Installed apps check `version.json` when opened and show **Update now / Later**. A higher first number (2.0.x) shows a required-update screen.

Pushes to any other branch only replace the **preview** pre-release, for testing.

Fixed download link, which always gives the newest version:
`https://hayytgkfuzhoyjsbwhwd.supabase.co/storage/v1/object/public/releases/duty-tracker-latest.apk`

## 3. Install on your phone

1. On the phone, open the fixed download link above. Or open **github.com/tharun1343/Nandha-Duty-Tracker/releases** while signed in to GitHub, open the newest release and download `duty-tracker.apk`.
2. Wait for the download to finish.
3. Open the downloaded file. If Android asks, allow **Install unknown apps** for your browser or Files app.
4. Open **Duty Tracker**, enter your email, then type the 6-digit code from the email.

Versions: `1.0.N`, where `N` is the GitHub Actions run number. The version shows at the bottom of **Settings**.

## How the parts fit

| Part | Where |
|---|---|
| App code (web + Android) | `src/`, `index.html`, `android/` (Capacitor) |
| Sync engine (offline first, newest edit wins) | `src/sync.js`, tests in `tests/unit/` |
| Database table + security rules | `supabase/schema.sql` |
| Build and release pipeline | `.github/workflows/android.yml` |
| End-to-end test (fake Supabase) | `tests/e2e/` → `npm run e2e` |
| Approved prototype (the spec) | `prototype/index.html` |
