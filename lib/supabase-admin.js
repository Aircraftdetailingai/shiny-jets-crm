import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Server-side Supabase client that bypasses Next.js App Router fetch caching.
 * Without cache:'no-store', GET selects (e.g. google_calendar status) can keep
 * serving a stale row forever — which is why Connections showed RECONNECT
 * REQUIRED after tokens were already repaired in the live DB.
 */
export function createAdminClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
