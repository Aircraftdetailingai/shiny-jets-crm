// Centralized env var access with trim to strip trailing newlines from Vercel env vars
export const env = {
  get GOOGLE_CLIENT_ID() { return (process.env.GOOGLE_CLIENT_ID || '').trim(); },
  get GOOGLE_CLIENT_SECRET() { return (process.env.GOOGLE_CLIENT_SECRET || '').trim(); },
  get GOOGLE_CALENDAR_REDIRECT_URI() { return (process.env.GOOGLE_CALENDAR_REDIRECT_URI || '').trim(); },
  get NEXT_PUBLIC_APP_URL() { return (process.env.NEXT_PUBLIC_APP_URL || '').trim(); },
  get SUPABASE_URL() { return (process.env.SUPABASE_URL || '').trim(); },
  get SUPABASE_SERVICE_KEY() { return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim(); },
};
