# Move the app to a new Supabase account (without losing data)

This guide moves the app's cloud database from the current Supabase project
(which is paused) to a **new, separate Supabase account**, and carries all your
data across. Nothing is deleted from the old project until you are happy the new
one works.

Your data lives in two places already: on your phone/browser (the app saves
everything on the device first) **and** in the old Supabase project. Because of
that, the safest way to migrate is to **back up from the app to a file and
restore it into the new project** — no SQL, and it works even though the old
project is paused.

The whole move is done in two app updates:

| Build | What it does | What you do |
|---|---|---|
| **v1.0.11** (already published) | Adds **Back up to file** / **Restore from a file**, still connected to the current project | Update, then **back up to a file** |
| **v1.0.12** (published after you send the new keys) | Connects the app to the **new** Supabase project | Update, sign in, then **restore from the file** |

---

## Step 1 — Back up your data (do this first, before anything else)

1. Open the app (phone or the web version) and let it update to **v1.0.11** (or
   newer). The version shows at the bottom of **Settings**.
2. Go to **Settings → Sync & backup → Back up to file**.
3. Save the file (`duty-tracker-backup-YYYY-MM-DD.json`) somewhere safe — Google
   Drive, email it to yourself, or keep it in Files. This single file holds every
   day's entry, your places, categories, amount fields and profile.

> Do this **before** switching to the new project. Once the app is connected to
> the new project it signs you into a different account, so back up while it is
> still on the current one.

As an extra safety net you can also export a month or a date range as **Excel**
from the **Export** tab — that is a human-readable copy of the entries.

---

## Step 2 — Create the new Supabase account and project (you)

1. Sign out of your current Supabase account (or use a different browser), then
   go to **supabase.com → Start your project** and create the **new account**.
2. **New project**:
   - Name: `duty-tracker`
   - Region: **South Asia (Mumbai)**
   - Database password: choose one and keep it yourself. The app never needs it.
3. When the project is ready: **SQL Editor → New query**. Paste the whole of
   [`supabase/schema.sql`](../supabase/schema.sql), then press **Run**. You should
   see *Success. No rows returned*. This creates the `records` table and the
   security rules.
4. **Authentication → Sign In / Providers → Email**:
   - **Enable Email provider**: on
   - **Email OTP Length**: `6`
   - **Email OTP Expiration**: `600` seconds (10 minutes)
5. **Authentication → Emails → Templates**. In both **Confirm signup** and
   **Magic Link**, replace the message body with:

   ```html
   <h2>Your Duty Tracker sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
   ```

   Without `{{ .Token }}` the email only contains a link, and the app cannot read
   the 6-digit code.
6. **Project Settings → API Keys**: copy the **Project URL** and the
   **anon / publishable** key.
   - These two are public and safe to share — send them to me here.
   - **Never** copy the **service_role / secret** key anywhere.

---

## Step 3 — I connect the app to the new project

Send me the **Project URL** and **anon/publishable key** from Step 2.6. I will:

- update the app's connection settings to the new project,
- publish **v1.0.12**, and
- give you the new signed APK (the web version updates on its own).

---

## Step 4 — Restore your data into the new project

1. Update the app to **v1.0.12**.
2. Sign in with your email and the 6-digit code (this creates your account in the
   new project).
3. Go to **Settings → Sync & backup → Restore from a file** and pick the backup
   file from Step 1.
4. Confirm. The app merges every record back in and uploads it to the new
   project. You will see "Backup restored and uploaded to the cloud".
5. Open **Home** and **Records** and check your entries and totals are all there.

Do this on each device you use (phone and web). After the first device uploads,
the others can simply sign in and sync — but restoring the file on each is the
surest way.

---

## Step 5 — Finish up

- Once you have confirmed the new project has everything, you can delete the old
  project from the old Supabase account (optional).
- Keep the backup file until you are sure. There is no harm in restoring it more
  than once — it never creates duplicates, because each record has a fixed id.

---

## If you no longer have the app with your data (fallback: copy the database)

Use this only if you cannot back up from the app (for example you changed phones
and the data is only in the old paused project). It needs the old project
running again and a little SQL.

1. **Old account → the paused project → Restore/Resume** so it runs again.
2. **Old project → Table Editor → `records` → Export → CSV.** Save the file.
3. Do Step 2 above to create the new project.
4. Sign into the app once against the new project so your user exists there. Then
   in the **new project → SQL Editor** run this to find your user id:

   ```sql
   select id, email from auth.users;
   ```

5. **New project → Table Editor → `records` → Import data from CSV**, and upload
   the CSV from step 2. When it asks, map the columns by the same names.
6. The imported rows still carry the **old** user id. Point them at your new user
   id (replace both ids below with the values from step 4):

   ```sql
   update public.records
     set user_id = '<new-user-id>'
     where user_id = '<old-user-id>';
   ```

7. On the app, sign out and sign back in. It pulls everything from the new
   project.

The backup-file method in Steps 1–4 is simpler and is the recommended one; this
database copy is only a fallback.
