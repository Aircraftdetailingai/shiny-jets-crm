import { createClient } from '@supabase/supabase-js';
import { createToken } from '@/lib/auth';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { normalizePlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const RP_ID = process.env.WEBAUTHN_RP_ID || 'crm.shinyjets.com';
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com', 'sales@shinyjets.com'];

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const { email, credential } = await request.json();
  if (!email || !credential) return Response.json({ error: 'Missing data' }, { status: 400 });

  const supabase = getSupabase();

  // Find detailer + challenge
  const { data: detailer } = await supabase
    .from('detailers')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (!detailer) return Response.json({ error: 'Account not found' }, { status: 404 });
  if (!detailer.webauthn_challenge) return Response.json({ error: 'No challenge' }, { status: 400 });

  // Find the credential
  const credentialId = credential.id;
  const { data: storedCred } = await supabase
    .from('webauthn_credentials')
    .select('*')
    .eq('credential_id', credentialId)
    .eq('detailer_id', detailer.id)
    .single();

  if (!storedCred) return Response.json({ error: 'Credential not found' }, { status: 404 });

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: detailer.webauthn_challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedCred.credential_id,
        publicKey: Buffer.from(storedCred.public_key, 'base64url'),
        counter: storedCred.counter,
        transports: storedCred.transports || ['internal'],
      },
    });

    if (!verification.verified) {
      return Response.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Update counter
    await supabase
      .from('webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', storedCred.id);

    // Clear challenge
    await supabase.from('detailers').update({ webauthn_challenge: null }).eq('id', detailer.id);

    // Issue JWT — same as login route
    const token = await createToken({ id: detailer.id, email: detailer.email });
    const isAdmin = ADMIN_EMAILS.includes(detailer.email?.toLowerCase());

    const user = {
      id: detailer.id,
      email: detailer.email,
      name: detailer.name,
      phone: detailer.phone || null,
      company: detailer.company || '',
      plan: isAdmin ? 'business' : normalizePlan(detailer.plan),
      plan_raw: detailer.plan || 'free',
      is_admin: isAdmin,
      status: detailer.status || 'active',
      theme_primary: detailer.theme_primary || '#007CB1',
      portal_theme: detailer.portal_theme || 'dark',
      theme_logo_url: detailer.theme_logo_url || null,
      terms_accepted_version: detailer.terms_accepted_version || null,
    };

    return Response.json({ token, user });
  } catch (err) {
    console.error('WebAuthn login verify error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
