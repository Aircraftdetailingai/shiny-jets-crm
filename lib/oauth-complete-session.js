// Turns a verified Supabase Auth user into a CRM session.
// The request body is not an identity source: email, oauth id, name, and
// provider come only from the user object auth.getUser returns for the
// access token. A missing or rejected token never reaches createToken.

import { redeemCompInviteIfAny } from '@/lib/comp-invites';
import { normalizePlan } from '@/lib/plans';
import {
  detailerEmailQuery,
  noteDuplicateDetailers,
  preferredDetailer,
} from '@/lib/auth-detailer-lookup';
import {
  hasVerifiedOAuthProvider,
  identityFromSupabaseUser,
  nameFromSupabaseUser,
  providerFromSupabaseUser,
} from '@/lib/oauth-identity';

const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com', 'sales@shinyjets.com'];

function unauthorized() {
  return { status: 401, body: { error: 'Unauthorized' } };
}

async function findDetailerByEmail(supabase, email) {
  const { data: matches, error } = await detailerEmailQuery(
    supabase.from('detailers').select('*'),
    email,
  );
  if (error) {
    console.error('[oauth-complete] Lookup error:', error.message);
    return { error };
  }
  noteDuplicateDetailers(matches, email);
  return { detailer: preferredDetailer(matches) };
}

async function linkOAuthIfMissing(supabase, detailer, provider, oauthId) {
  if (detailer.oauth_provider) return;
  await supabase.from('detailers').update({
    oauth_provider: provider,
    oauth_id: oauthId,
  }).eq('id', detailer.id);
}

/**
 * @param {{ supabase: object, accessToken: string, createToken: Function }} args
 * The JSON body is not an input. Email, name, and provider come from auth.getUser.
 */
export async function completeOAuthSession({ supabase, accessToken, createToken }) {
  if (!accessToken) return unauthorized();

  // getUser validates the access token with the Supabase Auth server.
  // A CRM JWT, a guessed email, or a random bearer string does not come back as a user.
  const { data: verified, error: verifyError } = await supabase.auth.getUser(accessToken);
  const identity = identityFromSupabaseUser(verified?.user);
  if (verifyError || !identity) return unauthorized();

  const authUser = verified.user;
  // Email/password Supabase users are not an OAuth proof. Otherwise anyone
  // who can create an unconfirmed (or auto-confirmed) Auth user for an
  // existing CRM email could exchange it for that account's session.
  if (!hasVerifiedOAuthProvider(authUser)) return unauthorized();

  const { email, oauth_id: oauthId } = identity;
  const name = nameFromSupabaseUser(authUser);
  const provider = providerFromSupabaseUser(authUser);

  console.log('[oauth-complete] START:', { email, name, provider });

  let { detailer, error: lookupError } = await findDetailerByEmail(supabase, email);
  if (lookupError) {
    return { status: 500, body: { error: 'Server error' } };
  }

  let isNewUser = false;

  if (detailer) {
    console.log('[oauth-complete] Found existing detailer:', detailer.id);
    await linkOAuthIfMissing(supabase, detailer, provider, oauthId);
  } else {
    console.log('[oauth-complete] Creating new detailer for:', email);
    isNewUser = true;

    const slugSource = (name || email.split('@')[0] || 'detailer').trim();
    const baseSlug = slugSource.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'detailer';
    let slug = baseSlug;
    for (let i = 1; i < 50; i++) {
      const { data: clash } = await supabase.from('detailers').select('id').eq('slug', slug).maybeSingle();
      if (!clash) break;
      slug = `${baseSlug}-${i}`;
    }

    const { data: newDetailer, error: createError } = await supabase
      .from('detailers')
      .insert({
        email,
        name: name || '',
        company: '',
        slug,
        plan: 'free',
        status: 'active',
        onboarding_completed: false,
        onboarding_complete: false,
        oauth_provider: provider,
        oauth_id: oauthId,
      })
      .select()
      .single();

    if (createError) {
      console.error('[oauth-complete] Create error:', createError.message, createError.code);

      if (createError.code === '23505') {
        const retry = await findDetailerByEmail(supabase, email);
        if (retry.error) return { status: 500, body: { error: 'Server error' } };
        if (retry.detailer) {
          console.log('[oauth-complete] Found existing on retry:', retry.detailer.id);
          detailer = retry.detailer;
          isNewUser = false;
          await linkOAuthIfMissing(supabase, detailer, provider, oauthId);
        } else {
          return { status: 500, body: { error: `Account exists but lookup failed: ${createError.message}` } };
        }
      } else {
        return { status: 500, body: { error: `Failed to create account: ${createError.message}` } };
      }
    } else {
      console.log('[oauth-complete] Created detailer:', newDetailer.id);
      detailer = newDetailer;
    }
  }

  if (!detailer?.id) {
    return { status: 500, body: { error: 'Server error' } };
  }

  if (isNewUser) {
    const compResult = await redeemCompInviteIfAny(supabase, detailer.id, detailer.email);
    if (compResult.applied) {
      detailer.plan = compResult.plan;
      detailer.subscription_status = compResult.subscription_status;
      if (compResult.trial_ends_at) detailer.trial_ends_at = compResult.trial_ends_at;
    }
  }

  if (isNewUser) {
    try {
      const { buildDefaultFlowData } = await import('@/lib/default-flow');
      const defaultFlow = buildDefaultFlowData();
      await supabase.from('intake_flows').upsert({
        detailer_id: detailer.id,
        flow_nodes: defaultFlow.flow_nodes,
        flow_edges: defaultFlow.flow_edges,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'detailer_id' });
    } catch (flowErr) {
      console.log('[oauth-complete] Default flow seed failed (non-critical):', flowErr.message);
    }
  }

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
    plan: isAdmin ? 'business' : normalizePlan(detailer.plan),
    plan_raw: detailer.plan || 'free',
    subscription_status: detailer.subscription_status || null,
    subscription_source: detailer.subscription_source || null,
    is_admin: isAdmin,
    status: detailer.status || 'active',
    theme_primary: detailer.theme_primary || '#007CB1',
    portal_theme: detailer.portal_theme || 'dark',
    theme_logo_url: detailer.theme_logo_url || null,
    terms_accepted_version: detailer.terms_accepted_version || null,
  };

  let serviceCount = 0;
  try {
    const { count } = await supabase.from('services').select('id', { count: 'exact', head: true }).eq('detailer_id', detailer.id);
    serviceCount = count || 0;
  } catch {
    // Service count only affects the new-user redirect.
  }

  const hasExistingData = serviceCount > 0;
  const redirect = (isNewUser && !hasExistingData) ? '/onboarding' : '/dashboard';
  console.log('[oauth-complete] DONE:', { redirect, isNewUser, onboardingDone, serviceCount });

  return { status: 200, body: { token, user, redirect } };
}
