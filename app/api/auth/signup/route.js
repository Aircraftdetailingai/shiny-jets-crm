import { createClient } from '@supabase/supabase-js';
import { hashPassword, createToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { welcomeTemplate } from '@/lib/email-templates';
import { redeemCompInviteIfAny } from '@/lib/comp-invites';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Bot mitigation ────────────────────────────────────────────────────────────
// Three layers stacked because each catches a different attack profile:
//   1) honeypot field   — dumb bots that fill every input
//   2) gibberish check  — bots filling random strings for name/company
//   3) per-IP rate limit — IP-cycling abusers and rapid retries
// All three respond with fake success rather than 4xx so the attacker doesn't
// learn what tripped them; rate-limit is the only one that returns 429 (so
// real users hit by it have a chance to back off).

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function alphaOnly(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Returns true if the string looks machine-generated.
// Calibrated so single-word brand names (Aviture, JetGlow, SparrowHawk,
// Soar, Shiny Jets, Aero Aesthetics) and short multi-word names pass.
function isLikelyGibberish(rawStr) {
  if (!rawStr) return false;
  const raw = String(rawStr);
  const alpha = alphaOnly(raw);
  if (alpha.length < 4) return false;

  // Rule 1: length >= 8 AND vowel ratio < 0.20.
  // Real English-derived names average ~38-40% vowels; bot-random hits 15-25%.
  if (alpha.length >= 8) {
    let vowelCount = 0;
    for (const ch of alpha) if (VOWELS.has(ch)) vowelCount++;
    if (vowelCount / alpha.length < 0.20) return true;
  }

  // Rule 2: 4+ consecutive consonants. English clusters cap at 3 ("strength"
  // is the famous exception but its alpha-only check stays well under our
  // length threshold elsewhere). y treated as a vowel here so real names
  // like "Snyder" don't trigger.
  let run = 0;
  for (const ch of alpha) {
    if (VOWELS.has(ch) || ch === 'y') run = 0;
    else { run++; if (run >= 4) return true; }
  }

  // Rule 3: length >= 8 AND case-transition ratio > 0.40 over alphabetic
  // chars. Short CamelCase brands (JetGlow, SparrowHawk) sit under length 8
  // and so are exempt; long zig-zag-case strings (ZwbyFoODResvKuXRkff,
  // vwhcxAanqtIzOhxOZnVk) blow past 0.40.
  const rawAlpha = raw.replace(/[^a-zA-Z]/g, '');
  if (rawAlpha.length >= 8) {
    let transitions = 0;
    for (let i = 1; i < rawAlpha.length; i++) {
      const aU = rawAlpha[i - 1] === rawAlpha[i - 1].toUpperCase();
      const bU = rawAlpha[i] === rawAlpha[i].toUpperCase();
      if (aU !== bU) transitions++;
    }
    if (transitions / rawAlpha.length > 0.40) return true;
  }

  return false;
}

const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_PER_WINDOW = 3;
// Module-scoped Map — survives across requests in the same Function instance
// (Fluid Compute re-uses instances), resets on cold start. v1 trade-off vs.
// adding a signup_attempts table; promote to DB only if cold-start churn
// proves to be a real evasion vector.
const signupAttempts = new Map();

function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

function withinRateLimit(ip) {
  const now = Date.now();
  const prior = (signupAttempts.get(ip) || []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  if (prior.length >= SIGNUP_MAX_PER_WINDOW) {
    signupAttempts.set(ip, prior);
    return false;
  }
  prior.push(now);
  signupAttempts.set(ip, prior);
  return true;
}

// Common "this was a bot — pretend it worked" response. No JWT, no cookie,
// no DB write. The bot moves on; we never expose detection.
function fakeSuccess() {
  return Response.json({ success: true, token: null, user: null });
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

    const body = await request.json();
    const { email, password, name, company, country, invite_token, referral_code, plan: requestedPlan } = body;

    const ip = getClientIp(request);

    // Layer 1: honeypot. The signup form has a visually-hidden input named
    // website_url; real users never fill it. Bots scraping all <input>s do.
    if (body.website_url && String(body.website_url).trim() !== '') {
      console.warn('[signup-bot] honeypot triggered:', { ip, email });
      return fakeSuccess();
    }

    // Layer 2: gibberish in name or company. Random-string bot signups
    // ("ZwbyFoODResvKuXRkff" / "vwhcxAanqtIzOhxOZnVk") fail both vowel-
    // ratio and consecutive-consonant heuristics.
    if (isLikelyGibberish(name) || isLikelyGibberish(company)) {
      console.warn('[signup-bot] gibberish detected:', { ip, name, company });
      return fakeSuccess();
    }

    // Layer 3: per-IP rate limit. > 3 signup attempts in the last hour from
    // one IP gets a 429 (the only layer where the attacker sees a 4xx,
    // because real humans hitting this would be a network or shared-NAT
    // issue we want them to back off from rather than silently confuse).
    if (!withinRateLimit(ip)) {
      console.warn('[signup-bot] rate limit exceeded:', { ip, email });
      return Response.json({ error: 'Too many attempts, please try again later' }, { status: 429 });
    }

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
          // Course bundle includes one year of Pro; stamp the expiry so the
          // plan-expirations cron downgrades them automatically when it lapses.
          const courseExpiry = new Date();
          courseExpiry.setFullYear(courseExpiry.getFullYear() + 1);
          await supabase.from('detailers').update({
            plan: 'pro',
            subscription_status: 'active',
            subscription_source: 'course_bundle',
            plan_expires_at: courseExpiry.toISOString(),
          }).eq('id', detailer.id);
          detailer.plan = 'pro';
          detailer.subscription_source = 'course_bundle';
          console.log(`[signup] Course purchaser detected, upgraded to Pro: ${normalizedEmail}`);
        }
      } catch (e) {
        console.log('[signup] Course check failed (non-critical):', e.message);
      }
    }

    // Redeem any pending comp invite for this email. Runs AFTER the
    // course-bundle branch so a comp invite (intentional admin grant) wins
    // over an automatic course-bundle upgrade. Never blocks signup.
    const compResult = await redeemCompInviteIfAny(supabase, detailer.id, normalizedEmail);
    if (compResult.applied) {
      detailer.plan = compResult.plan;
      detailer.subscription_status = compResult.subscription_status;
      if (compResult.trial_ends_at) detailer.trial_ends_at = compResult.trial_ends_at;
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
      subscription_status: detailer.subscription_status || null,
      subscription_source: detailer.subscription_source || null,
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
