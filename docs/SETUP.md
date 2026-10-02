# Setup: Supabase, GitHub and installing the app

You only do this once. Steps marked **(you)** happen in a dashboard; nothing here needs a password to be sent to anyone.

## 1. Supabase project (you)

1. Go to **supabase.com → Dashboard → New project**.
   - Name: `duty-tracker`
   - Region: **South Asia (Mumbai)**
   - Database password: choose one and keep it yourself. The app never needs it.
2. When the project is ready: **SQL Editor → New query**. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql), then press **Run**. You should see *Success. No rows returned*.
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

Open **github.com/tharun1343/Nandha-Duty-Tracker → Settings → Secrets and variables → Actions**.

**Variables** tab → **New repository variable** (twice):

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from step 1.5 |
| `SUPABASE_ANON_KEY` | the anon / publishable key from step 1.5 |

**Secrets** tab → **New repository secret**, once for each of the four values in the `android-signing-secrets.txt` file you were sent:
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEYSTORE_BASE64`

Until the four secrets are added, builds are debug-signed. Each new debug build then has to be uninstalled before the next one installs. With the secrets, every new version installs over the old one and keeps your data.

After saving, re-run the latest build: **Actions → Build app → Run workflow**.

### Optional: in-app update banner and web version
The update banner reads `version.json` from GitHub Pages, and GitHub Pages is free only for **public** repositories. This repository has no secrets in it, so making it public is safe. To turn it on:
1. **Settings → General → Danger Zone → Change visibility → Public**
2. **Settings → Pages → Source: GitHub Actions**
3. **Variables** tab → add `PAGES_ENABLED` = `true`

While the repository stays private, the app still works fully. You download new versions yourself from **Releases**.

## 3. Install on your phone

1. On the phone, open **github.com/tharun1343/Nandha-Duty-Tracker/releases** (signed in to GitHub, because the repository is private).
2. Open the newest release (**preview** while testing, **vX.Y.N** after merging to `main`) and download `duty-tracker.apk`.
3. Open the downloaded file. If Android asks, allow **Install unknown apps** for your browser or Files app.
4. Open **Duty Tracker**, enter your email, then type the 6-digit code from the email.

Versions: `1.0.N`, where `N` is the GitHub Actions run number. The version shows at the bottom of **Settings**.

## How the parts fit

| Part | Where |
|---|---|
| App code (web + Android) | `src/`, `index.html`, `android/` (Capacitor) |
| Sync engine (offline first, newest edit wins) | `src/sync.js`, tests in `tests/unit/` |
| Database table + security rules | `supabase/schema.sql` |
| Build and release | `.github/workflows/android.yml` |
| End-to-end test (fake Supabase) | `tests/e2e/` → `npm run e2e` |
| Approved prototype (the spec) | `prototype/index.html` |
