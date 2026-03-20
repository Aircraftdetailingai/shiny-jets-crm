import { createClient } from '@supabase/supabase-js';
import { hashPassword, createToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Check if signup is invite-only.
 * Priority: DB app_settings override > INVITE_ONLY env var > default false
 */
async function isInviteOnly(supabase) {
  // Default from env var
  let inviteOnly = process.env.INVITE_ONLY === 'true';

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'invite_only')
      .maybeSingle();

    if (data) {
      inviteOnly = data.value === 'true';
    }
  } catch {
    // Table may not exist yet — use env var
  }

  return inviteOnly;
}

// POST — create account (invite-only or open based on config)
export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Server error' }, { status: 500 });

    const { email, password, name, company, country, invite_token, referral_code } = await request.json();

    const inviteOnly = await isInviteOnly(supabase);

    if (!email || !password || !name) {
      return Response.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    if (inviteOnly && !invite_token) {
      return Response.json({ error: 'An invite token is required to sign up' }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if account already exists
    const { data: existing } = await supabase
      .from('detailers')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      return Response.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
    }

    let plan = 'free';
    let trialDays = 14; // Default trial for open signup
    let invite = null;

    // Validate invite token if provided
    if (invite_token) {
      const { data: inviteData, error: invErr } = await supabase
        .from('beta_invites')
        .select('*')
        .eq('token', invite_token)
        .eq('status', 'pending')
        .single();

      if (invErr || !inviteData) {
        if (inviteOnly) {
          return Response.json({ error: 'Invalid or expired invite token' }, { status: 400 });
        }
        // In open mode, ignore invalid token and proceed with defaults
      } else {
        // Token is valid — check email match
        if (inviteData.email.toLowerCase() !== normalizedEmail) {
          if (inviteOnly) {
            return Response.json({ error: 'Email does not match invite' }, { status: 400 });
          }
          // In open mode, ignore mismatched token
        } else {
          invite = inviteData;
          plan = invite.plan;
          trialDays = invite.duration_days;
        }
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    // Create the detailer account
    const insertRow = {
      email: normalizedEmail,
      name: name.trim(),
      company: company?.trim() || null,
      country: country || null,
      password_hash: passwordHash,
      plan,
      status: 'active',
      trial_ends_at: trialEndsAt.toISOString(),
    };

    let detailer = null;
    // Column-stripping retry in case a column doesn't exist yet
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: createErr } = await supabase
        .from('detailers')
        .insert(insertRow)
        .select()
        .single();

      if (!createErr) {
        detailer = data;
        break;
      }

      const colMatch = createErr.message?.match(/column "([^"]+)".*does not exist/)
        || createErr.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) {
        console.log(`[signup] Stripping missing column: ${colMatch[1]}`);
        delete insertRow[colMatch[1]];
        continue;
      }

      console.error('[signup] Insert error:', createErr.message, createErr);
      return Response.json({ error: `Failed to create account: ${createErr.message}` }, { status: 500 });
    }

    if (!detailer) {
      console.error('[signup] Failed after column stripping retries');
      return Response.json({ error: 'Failed to create account after retries' }, { status: 500 });
    }

    // Mark invite as used (if we validated one)
    if (invite) {
      await supabase
        .from('beta_invites')
        .update({ status: 'used', used_at: new Date().toISOString(), used_by: detailer.id })
        .eq('id', invite.id);
    }

    // Update prospect if one exists for this email
    await supabase
      .from('prospects')
      .update({ status: 'signed_up' })
      .eq('email', normalizedEmail);

    // Process referral code if provided
    if (referral_code) {
      try {
        const { data: referrer } = await supabase
          .from('detailers')
          .select('id')
          .eq('referral_code', referral_code.toUpperCase())
          .single();

        if (referrer && referrer.id !== detailer.id) {
          await supabase
            .from('detailers')
            .update({ referrer_id: referrer.id })
            .eq('id', detailer.id);

          await supabase
            .from('referrals')
            .insert({
              referrer_id: referrer.id,
              referred_id: detailer.id,
              referral_code: referral_code.toUpperCase(),
              status: 'pending',
              referrer_reward: '1_month_pro',
              referred_reward: '500_points',
            });
        }
      } catch (refErr) {
        console.log('Referral processing failed (non-critical):', refErr.message);
      }
    }

    // Create JWT
    const token = await createToken({ id: detailer.id, email: detailer.email });

    // Set auth cookie
    try {
      const cookieStore = await cookies();
      cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
    } catch {}

    const user = {
      id: detailer.id,
      email: detailer.email,
      name: detailer.name,
      company: detailer.company,
      plan: detailer.plan,
      status: detailer.status,
      is_admin: false,
    };

    return Response.json({ token, user });
  } catch (err) {
    console.error('[signup] Unhandled error:', err);
    return Response.json({ error: `Server error: ${err.message}` }, { status: 500 });
  }
}
