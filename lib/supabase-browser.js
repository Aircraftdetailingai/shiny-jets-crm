import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function getSupabaseBrowser() {
  if (supabase) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // detectSessionInUrl stays off. The default client treats ?error= and
  // ?code= on whatever page imported it as an auth callback, which clears
  // the stored Supabase session (payments uses ?stripe=error, OAuth uses
  // ?code=). Callback pages pass the code to exchangeCodeForSession themselves.
  // A failed token refresh signs the Supabase session out only. It must not
  // clear vector_token; CRM API calls use that app JWT, not the Supabase one.
  supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return supabase;
}
