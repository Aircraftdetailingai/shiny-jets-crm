import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve the owning detailer_id. Owner JWTs put detailer.id in user.id
  // directly; crew JWTs put team_member.id in user.id and the real
  // detailer.id in user.detailer_id. Without this, a save from a crew JWT
  // (or any session shape with detailer_id set) would .eq('id', team_member_id)
  // → match no detailer rows → silent zero-row update + 200, which is what
  // Brett saw on /settings/business.
  const detailerId = user.detailer_id || user.id;

  const body = await request.json();
  // Bank details belong to the account owner. A team session can update
  // business contact fields but must not write ACH.
  if (user.account_kind === 'team') {
    delete body.ach_routing_number;
    delete body.ach_account_number;
    delete body.ach_account_name;
    delete body.ach_bank_name;
  }
  const updates = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.company !== undefined) updates.company = body.company;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.google_business_url !== undefined) updates.google_business_url = body.google_business_url;
  // Mailing address (for invoice "remit to" block + onboarding)
  if (body.mailing_address_line1 !== undefined) updates.mailing_address_line1 = body.mailing_address_line1 || null;
  if (body.mailing_address_line2 !== undefined) updates.mailing_address_line2 = body.mailing_address_line2 || null;
  if (body.mailing_city !== undefined) updates.mailing_city = body.mailing_city || null;
  if (body.mailing_state !== undefined) updates.mailing_state = body.mailing_state || null;
  if (body.mailing_zip !== undefined) updates.mailing_zip = body.mailing_zip || null;
  if (body.mailing_country !== undefined) updates.mailing_country = body.mailing_country || 'US';
  // ACH bank info — sensitive, stored here but NOT returned by /api/user/me
  // unless include_remit=1 is passed. Validate shape lightly before accepting.
  if (body.ach_routing_number !== undefined) {
    const r = (body.ach_routing_number || '').replace(/\D/g, '');
    updates.ach_routing_number = r || null;
  }
  if (body.ach_account_number !== undefined) {
    const a = (body.ach_account_number || '').replace(/\D/g, '');
    updates.ach_account_number = a || null;
  }
  if (body.ach_account_name !== undefined) updates.ach_account_name = body.ach_account_name || null;
  if (body.ach_bank_name !== undefined) updates.ach_bank_name = body.ach_bank_name || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Update by resolved detailer id and return the row so silent
  // zero-update writes (e.g. wrong id) surface as a real 404 instead of
  // a fake `success: true`. Column-stripping retry guards against
  // PostgREST schema-cache misses on newly-added columns
  // (e.g. google_business_url) that would otherwise 500 the entire save.
  let payload = { ...updates };
  let updated = null;
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('detailers')
      .update(payload)
      .eq('id', detailerId)
      .select('id')
      .maybeSingle();

    if (!error) { updated = data; lastError = null; break; }
    lastError = error;
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/i)
      || error.message?.match(/Could not find the '([^']+)' column/i);
    if (colMatch && payload[colMatch[1]] !== undefined) {
      console.warn('[user/profile] stripping unknown column:', colMatch[1]);
      delete payload[colMatch[1]];
      continue;
    }
    break;
  }

  if (lastError) {
    console.error('Failed to update profile:', lastError);
    return Response.json({ error: 'Failed to update profile' }, { status: 500 });
  }
  if (!updated) {
    console.error('[user/profile] update matched zero rows for detailerId:', detailerId, 'user.id:', user.id, 'role:', user.role || 'owner');
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  console.log('[user/profile] saved fields for detailer', detailerId, ':', Object.keys(payload));
  return Response.json({ success: true, saved: Object.keys(payload) });
}
