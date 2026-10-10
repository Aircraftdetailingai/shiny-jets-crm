// Build the CRM session a team member gets after invite accept or email login.
// The JWT id is the owning detailer so existing tenant checks keep working.
// Identity (name, email, role) stays the member's. Plan and branding come
// from the owner — never from a free personal signup.

import { createToken } from '@/lib/auth';
import { normalizePlan } from '@/lib/plans';
import { teamTokenClaims, withTeamIdentity } from '@/lib/team-access';

export async function buildTeamCrmSession(supabase, member) {
  const { data: owner } = await supabase
    .from('detailers')
    .select('id, email, name, company, plan, subscription_status, subscription_source, theme_primary, portal_theme, theme_logo_url, logo_url, preferred_currency')
    .eq('id', member.detailer_id)
    .maybeSingle();

  const ownerUser = {
    id: owner?.id || member.detailer_id,
    email: owner?.email || null,
    name: owner?.name || null,
    company: owner?.company || owner?.name || '',
    plan: normalizePlan(owner?.plan),
    plan_raw: owner?.plan || 'free',
    subscription_status: owner?.subscription_status || null,
    subscription_source: owner?.subscription_source || null,
    is_admin: false,
    theme_primary: owner?.theme_primary || '#007CB1',
    portal_theme: owner?.portal_theme || 'dark',
    theme_logo_url: owner?.theme_logo_url || null,
    logo_url: owner?.logo_url || null,
    currency: owner?.preferred_currency || 'USD',
  };
  const user = withTeamIdentity(ownerUser, member);
  const token = await createToken(teamTokenClaims(member, ownerUser.id));
  return { token, user };
}
