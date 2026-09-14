// Centralized env var access with trim to strip trailing newlines from Vercel env vars
function clean(value) {
  return String(value || '')
    .trim()
    // Guard against env values pasted with a literal \n suffix
    .replace(/\\n$/g, '')
    .trim();
}

export const env = {
  get GOOGLE_CLIENT_ID() { return clean(process.env.GOOGLE_CLIENT_ID); },
  get GOOGLE_CLIENT_SECRET() { return clean(process.env.GOOGLE_CLIENT_SECRET); },
  get GOOGLE_CALENDAR_REDIRECT_URI() { return clean(process.env.GOOGLE_CALENDAR_REDIRECT_URI); },
  get NEXT_PUBLIC_APP_URL() { return clean(process.env.NEXT_PUBLIC_APP_URL); },
  get SUPABASE_URL() { return clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL); },
  get SUPABASE_SERVICE_KEY() { return clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY); },
};
