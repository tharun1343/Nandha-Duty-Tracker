/* Supabase: email-code sign-in and the `records` table used by sync.js. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let sb = null;
function client() {
  if (!sb) sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ddt-auth' } });
  return sb;
}

/** Turns any error into one with a `code` the UI understands. */
function classify(e) {
  const msg = (e && (e.message || e.error_description)) || String(e);
  const status = e && e.status;
  let code = 'server';
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /Failed to fetch|NetworkError|Load failed|network/i.test(msg)) code = 'offline';
  else if (status === 429 || /rate limit|security purposes|too many/i.test(msg)) code = 'rate';
  else if (e && (e.code === 'otp_expired' || e.code === 'invalid_otp') || /expired|invalid.*(otp|token|code)|token.*invalid/i.test(msg)) code = 'badcode';
  else if (status === 401 || /JWT|not authenticated|refresh token/i.test(msg)) code = 'auth';
  const err = new Error(msg); err.code = code; err.status = status; return err;
}

export async function getSession() {
  if (!configured) return null;
  const { data } = await client().auth.getSession();
  return data.session;
}
export async function sendCode(email) {
  const { error } = await client().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw classify(error);
}
export async function verifyCode(email, token) {
  const { data, error } = await client().auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw classify(error);
  if (!data.session) throw classify(new Error('No session returned'));
  return data.session;
}
export async function signOut() {
  try { await client().auth.signOut({ scope: 'local' }); } catch (e) { /* local sign-out never needs the network */ }
}

async function uid() {
  const s = await getSession();
  if (!s) { const e = new Error('Not signed in'); e.code = 'auth'; throw e; }
  return s.user.id;
}
/** Network side of sync.js: upsert rows, then read rows newer than the cursor. */
export const api = {
  async push(rows) {
    const user_id = await uid();
    try {
      const { error } = await client().from('records').upsert(rows.map(r => ({ ...r, user_id })), { onConflict: 'user_id,kind,id' });
      if (error) throw error;
    } catch (e) { throw classify(e); }
  },
  async pull(cursor, limit) {
    const user_id = await uid();
    try {
      const { data, error } = await client().from('records')
        .select('kind,id,data,deleted,client_updated_at,seq')
        .eq('user_id', user_id).gt('seq', cursor).order('seq', { ascending: true }).limit(limit);
      if (error) throw error;
      return data || [];
    } catch (e) { throw classify(e); }
  }
};
