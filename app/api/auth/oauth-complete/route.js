import { createClient } from '@supabase/supabase-js';
import { createToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com', 'sales@shinyjets.com'];

export async function POST(request) {
  try {
    const { email, name, provider, oauth_id } = await request.json();

    console.log('[oauth-complete] START:', { email, name, provider });

    if (!email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Look up existing detailer
    const { data: existing, error: lookupError } = await supabase
      .from('detailers')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (lookupError) {
      console.error('[oauth-complete] Lookup error:', lookupError.message);
    }

    let detailer;
    let isNewUser = false;

    if (existing) {
      console.log('[oauth-complete] Found existing detailer:', existing.id);
      detailer = existing;

      // Update OAuth fields if missing
      if (!existing.oauth_provider) {
        await supabase.from('detailers').update({
          oauth_provider: provider,
          oauth_id: oauth_id,
        }).eq('id', existing.id);
      }
    } else {
      console.log('[oauth-complete] Creating new detailer for:', email);
      isNewUser = true;

      const { data: newDetailer, error: createError } = await supabase
        .from('detailers')
        .insert({
          email: email.toLowerCase().trim(),
          name: name || '',
          company: '',
          plan: 'free',
          status: 'active',
          onboarding_completed: false,
          onboarding_complete: false,
          oauth_provider: provider,
          oauth_id: oauth_id,
        })
        .select()
        .single();

      if (createError) {
        console.error('[oauth-complete] Create error:', createError.message, createError.code);

        // Handle unique constraint violation — account exists but lookup missed it (race condition)
        if (createError.code === '23505') {
          const { data: retryLookup } = await supabase
            .from('detailers')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

          if (retryLookup) {
            console.log('[oauth-complete] Found existing on retry:', retryLookup.id);
            detailer = retryLookup;
            isNewUser = false;
            if (!retryLookup.oauth_provider) {
              await supabase.from('detailers').update({
                oauth_provider: provider,
                oauth_id: oauth_id,
              }).eq('id', retryLookup.id);
            }
          } else {
            return Response.json({ error: `Account exists but lookup failed: ${createError.message}` }, { status: 500 });
          }
        } else {
          return Response.json({ error: `Failed to create account: ${createError.message}` }, { status: 500 });
        }
      } else {
        console.log('[oauth-complete] Created detailer:', newDetailer.id);
        detailer = newDetailer;
      }
    }

    // Issue JWT
    const token = await createToken({ id: detailer.id, email: detailer.email });
    console.log('[oauth-complete] JWT issued for:', detailer.id);

    const isAdmin = ADMIN_EMAILS.includes(detailer.email?.toLowerCase());
    const onboardingDone = detailer.onboarding_completed === true || detailer.onboarding_complete === true;

    const user = {
      id: detailer.id,
      email: detailer.email,
      name: detailer.name,
      phone: detailer.phone || null,
      company: detailer.company || '',
      plan: isAdmin ? 'enterprise' : (detailer.plan || 'free'),
      subscription_status: detailer.subscription_status || null,
      subscription_source: detailer.subscription_source || null,
      is_admin: isAdmin,
      status: detailer.status || 'active',
      theme_primary: detailer.theme_primary || '#007CB1',
      portal_theme: detailer.portal_theme || 'dark',
      theme_logo_url: detailer.theme_logo_url || null,
      terms_accepted_version: detailer.terms_accepted_version || null,
    };

    // Check service count — existing users with services are never new
    let serviceCount = 0;
    try {
      const { count } = await supabase.from('services').select('id', { count: 'exact', head: true }).eq('detailer_id', detailer.id);
      serviceCount = count || 0;
    } catch {}

    const hasExistingData = serviceCount > 0;
    const redirect = (isNewUser && !hasExistingData) ? '/onboarding' : '/dashboard';
    console.log('[oauth-complete] DONE:', { redirect, isNewUser, onboardingDone, serviceCount });

    return Response.json({ token, user, redirect });
  } catch (err) {
    console.error('[oauth-complete] Error:', err.message);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
