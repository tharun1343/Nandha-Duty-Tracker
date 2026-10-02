/* Build-time settings. Set them as GitHub Actions repository variables (or in a local .env file):
   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY — Supabase → Project Settings → API (the public anon/publishable key only)
   VITE_UPDATE_URL — where the build publishes version.json (GitHub Pages) */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const UPDATE_URL = import.meta.env.VITE_UPDATE_URL || '';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0-dev';
