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

// POST — create account from invite
export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Server error' }, { status: 500 });

    const { email, password, name, company, country, invite_token, referral_code } = await request.json();

    if (!email || !password || !name || !invite_token) {
      return Response.json({ error: 'Name, email, password, and invite token are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validate invite token
    const { data: invite, error: invErr } = await supabase
      .from('beta_invites')
      .select('*')
      .eq('token', invite_token)
      .eq('status', 'pending')
      .single();

    if (invErr || !invite) {
      return Response.json({ error: 'Invalid or expired invite token' }, { status: 400 });
    }

    // Email must match invite
    if (invite.email.toLowerCase() !== normalizedEmail) {
      return Response.json({ error: 'Email does not match invite' }, { status: 400 });
    }

    // Check if account already exists
    const { data: existing } = await supabase
      .from('detailers')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      return Response.json({ error: 'An account with this email already exists. Please log in instead.' }, { status: 409 });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + invite.duration_days);

    // Create the detailer account
    const { data: detailer, error: createErr } = await supabase
      .from('detailers')
      .insert({
        email: normalizedEmail,
        name: name.trim(),
        company: company?.trim() || null,
        country: country || null,
        password_hash: passwordHash,
        plan: invite.plan,
        status: 'active',
        trial_ends_at: trialEndsAt.toISOString(),
      })
      .select()
      .single();

    if (createErr) {
      console.error('Signup error:', createErr);
      return Response.json({ error: 'Failed to create account' }, { status: 500 });
    }

    // Mark invite as used
    await supabase
      .from('beta_invites')
      .update({ status: 'used', used_at: new Date().toISOString(), used_by: detailer.id })
      .eq('id', invite.id);

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
          // Store referrer_id on the new detailer
          await supabase
            .from('detailers')
            .update({ referrer_id: referrer.id })
            .eq('id', detailer.id);

          // Create pending referral record
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
    console.error('Signup error:', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
