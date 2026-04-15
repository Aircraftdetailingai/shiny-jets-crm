import { createClient } from '@supabase/supabase-js';
import { hashPassword, createToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { welcomeTemplate } from '@/lib/email-templates';

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

    const { email, password, name, company, country, invite_token, referral_code, plan: requestedPlan } = await request.json();

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

    let plan = requestedPlan || 'free';
    // Only allow free plan on direct signup — paid plans require Shopify subscription
    if (!['free'].includes(plan)) plan = 'free';
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

    // Generate referral code for new detailer
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let newReferralCode = '';
    for (let i = 0; i < 8; i++) newReferralCode += chars.charAt(Math.floor(Math.random() * chars.length));

    // Generate slug from company name (or name)
    const slugSource = company?.trim() || name.trim();
    const baseSlug = slugSource.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug || 'detailer';
    for (let i = 2; i <= 20; i++) {
      const { data: existing } = await supabase.from('detailers').select('id').eq('slug', slug).maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${i}`;
    }

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
      referral_code: newReferralCode,
      slug,
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

    // Update prospect if one exists for this email (non-critical)
    try {
      await supabase.from('prospects').update({ status: 'signed_up' }).eq('email', normalizedEmail);
    } catch {}

    // Check if this email has a 5-day course purchase → grant Pro access
    if (detailer.plan === 'free') {
      try {
        const { data: courseAccess } = await supabase
          .from('app_access')
          .select('product_type, status')
          .eq('email', normalizedEmail)
          .eq('status', 'active')
          .in('product_type', ['masterclass_annual'])
          .maybeSingle();

        if (courseAccess) {
          await supabase.from('detailers').update({
            plan: 'pro',
            subscription_status: 'active',
            subscription_source: 'course_bundle',
          }).eq('id', detailer.id);
          detailer.plan = 'pro';
          detailer.subscription_source = 'course_bundle';
          console.log(`[signup] Course purchaser detected, upgraded to Pro: ${normalizedEmail}`);
        }
      } catch (e) {
        console.log('[signup] Course check failed (non-critical):', e.message);
      }
    }

    // Create default intake flow for new detailer
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
      console.log('[signup] Default flow creation failed (non-critical):', flowErr.message);
    }

    // Process referral code if provided
    if (referral_code) {
      try {
        const { data: referrer } = await supabase
          .from('detailers')
          .select('id, name, email, referral_count')
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
              referrer_detailer_id: referrer.id,
              referred_detailer_id: detailer.id,
              referred_email: normalizedEmail,
              referral_code: referral_code.toUpperCase(),
              reward_months: 1,
            });

          // Increment referrer's referral count
          const newCount = (referrer.referral_count || 0) + 1;
          await supabase.from('detailers').update({ referral_count: newCount }).eq('id', referrer.id);

          // Send referral congratulations email to referrer
          if (referrer.email && process.env.RESEND_API_KEY) {
            try {
              const { Resend } = require('resend');
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
                to: referrer.email,
                subject: 'You referred a new detailer!',
                html: `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                  <h2 style="color:#007CB1;">You referred a new detailer!</h2>
                  <p><strong>${name.trim()}</strong> just joined Shiny Jets CRM using your referral code.</p>
                  <p>You now have <strong>${newCount}</strong> referral${newCount !== 1 ? 's' : ''}.</p>
                  <p style="margin-top:20px;"><a href="https://crm.shinyjets.com/dashboard" style="background:#007CB1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Dashboard</a></p>
                  <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
                </div>`,
              });
            } catch {}
          }
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
        maxAge: 60 * 60 * 24 * 30, // 30 days
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

    // Send welcome email via Resend REST API (proven reliable — same as Shopify webhook)
    if (process.env.RESEND_API_KEY) {
      try {
        const tmpl = welcomeTemplate({ detailer: { name, email: normalizedEmail } });
        const fromAddr = process.env.RESEND_FROM_EMAIL || 'Brett @ Shiny Jets <noreply@mail.shinyjets.com>';
        console.log('[signup] Sending welcome email to:', normalizedEmail, 'from:', fromAddr);
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromAddr,
            to: normalizedEmail,
            reply_to: 'brett@shinyjets.com',
            subject: tmpl.subject,
            html: tmpl.html,
            text: tmpl.text,
          }),
        });
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          console.log('[signup] Welcome email sent:', emailData.id, 'to:', normalizedEmail);
        } else {
          const errBody = await emailRes.text();
          console.error('[signup] Resend rejected welcome email:', emailRes.status, errBody);
        }
      } catch (emailErr) {
        console.error('[signup] Welcome email error:', emailErr.message);
      }
    } else {
      console.warn('[signup] RESEND_API_KEY not set — skipping welcome email');
    }

    // Schedule 5-message drip campaign (same as Shopify signups)
    try {
      const now = new Date();
      const dripRows = [0, 1, 3, 5, 7].map(offset => ({
        detailer_id: detailer.id,
        message_id: `drip-day-${offset}`,
        scheduled_for: new Date(now.getTime() + offset * 86400000).toISOString(),
      }));
      await supabase.from('drip_messages').insert(dripRows);
      console.log('[signup] Drip campaign scheduled for:', normalizedEmail);
    } catch (dripErr) {
      console.error('[signup] Drip scheduling failed:', dripErr.message);
    }

    // Send admin notification email (non-blocking)
    try {
      const signupDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Brett @ Shiny Jets <noreply@mail.shinyjets.com>',
        to: 'brett@shinyjets.com',
        subject: `New Detailer Signup — ${name.trim()} (${normalizedEmail})`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
          <h2 style="color:#007CB1;">New Detailer Signup</h2>
          <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin:15px 0;">
            <p><strong>Name:</strong> ${name.trim()}</p>
            <p><strong>Email:</strong> ${normalizedEmail}</p>
            <p><strong>Company:</strong> ${company?.trim() || 'Not provided'}</p>
            <p><strong>Plan:</strong> ${plan}</p>
            <p><strong>Date:</strong> ${signupDate} ET</p>
            <p><strong>Referral Code:</strong> ${referral_code || 'None'}</p>
          </div>
          <a href="https://crm.shinyjets.com/admin/detailers" style="display:inline-block;padding:12px 24px;background:#007CB1;color:white;text-decoration:none;border-radius:8px;margin-top:15px;">View in Admin</a>
        </div>`,
      }),
      });
      console.log('[signup] Admin notification sent for:', normalizedEmail);
    } catch (adminErr) {
      console.error('[signup] Admin notification failed:', adminErr.message);
    }

    return Response.json({ token, user });
  } catch (err) {
    console.error('[signup] Unhandled error:', err.message);
    console.error('[signup] Stack:', err.stack);
    return Response.json({ error: `Server error: ${err.message}` }, { status: 500 });
  }
}
