import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local manually
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.production.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@vectorav.ai';

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase credentials'); process.exit(1); }
if (!RESEND_API_KEY) { console.error('Missing RESEND_API_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend = new Resend(RESEND_API_KEY);

const INVITES = [
  { email: 'sabdiazgalasso@gmail.com' },
  { email: 'chris@jetglowaviation.com' },
  { email: 'richard@rampsidedetailing.com' },
  { email: 'dustin@realcleanproducts.com' },
];

const PLAN = 'pro';
const DURATION_DAYS = 180;
const NOTE = 'You\'ve been personally invited by Brett Berry to try Vector Aviation CRM — 6 months of Pro access, completely free.';

function buildEmailHtml(email, token) {
  const signupUrl = `${APP_URL}/signup?invite=${token}`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding: 40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
        <!-- Header -->
        <tr><td style="background: linear-gradient(135deg, #0F1117 0%, #1a2332 100%); padding: 32px 40px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin:0; color: #007CB1; font-size: 24px; font-weight: 300; letter-spacing: 0.3em;">VECTOR</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.5); font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;">Aviation CRM</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="background: #ffffff; padding: 40px;">
          <h2 style="margin: 0 0 20px; color: #0F1117; font-size: 22px; font-weight: 600;">You're Invited</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6; margin: 0 0 20px;">
            You've been personally invited by <strong>Brett Berry</strong> to try Vector Aviation CRM — the first platform built exclusively for aircraft detailers.
          </p>
          <p style="font-size: 16px; color: #333; line-height: 1.6; margin: 0 0 24px;">
            We're giving you <strong>6 months of Pro access — completely free</strong>. No credit card required.
          </p>

          <!-- Invite Details Card -->
          <div style="background: #faf8f3; border-left: 4px solid #007CB1; padding: 20px 24px; margin: 0 0 28px; border-radius: 0 8px 8px 0;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">Your Invitation</p>
            <table cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr><td style="padding: 4px 0; font-size: 15px; color: #333;"><strong>Plan:</strong></td><td style="padding: 4px 0; font-size: 15px; color: #333;">Pro</td></tr>
              <tr><td style="padding: 4px 0; font-size: 15px; color: #333;"><strong>Duration:</strong></td><td style="padding: 4px 0; font-size: 15px; color: #333;">180 days (6 months)</td></tr>
              <tr><td style="padding: 4px 0; font-size: 15px; color: #333;"><strong>Cost:</strong></td><td style="padding: 4px 0; font-size: 15px; color: #007CB1; font-weight: 600;">$0</td></tr>
            </table>
          </div>

          <!-- Features -->
          <p style="font-size: 14px; color: #555; margin: 0 0 16px;"><strong>What you get with Pro:</strong></p>
          <table cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
            <tr><td style="padding: 6px 0; font-size: 14px; color: #555;">&#10003;&nbsp; Professional quote builder with aircraft database</td></tr>
            <tr><td style="padding: 6px 0; font-size: 14px; color: #555;">&#10003;&nbsp; Online payments via Stripe</td></tr>
            <tr><td style="padding: 6px 0; font-size: 14px; color: #555;">&#10003;&nbsp; Customer CRM & job scheduling</td></tr>
            <tr><td style="padding: 6px 0; font-size: 14px; color: #555;">&#10003;&nbsp; Team management & time tracking</td></tr>
            <tr><td style="padding: 6px 0; font-size: 14px; color: #555;">&#10003;&nbsp; Inventory & equipment tracking</td></tr>
            <tr><td style="padding: 6px 0; font-size: 14px; color: #555;">&#10003;&nbsp; Analytics & business reports</td></tr>
          </table>

          <!-- CTA -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signupUrl}" style="display: inline-block; background: #007CB1; color: #0F1117; text-decoration: none; padding: 16px 48px; border-radius: 4px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px;">
              Accept Your Invitation
            </a>
          </div>

          <p style="font-size: 12px; color: #aaa; text-align: center; margin: 24px 0 0;">
            This invite is for <strong>${email}</strong> only and can be used once.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background: #0F1117; padding: 24px 40px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="margin: 0; color: rgba(255,255,255,0.4); font-size: 12px;">Shiny Jets CRM &mdash; Built for aircraft detailers</p>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.25); font-size: 11px;">shinyjets.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function main() {
  console.log('=== Sending Beta Invites ===\n');
  console.log(`Plan: ${PLAN}`);
  console.log(`Duration: ${DURATION_DAYS} days (6 months)`);
  console.log(`Emails: ${INVITES.map(i => i.email).join(', ')}\n`);

  const results = [];

  for (const invite of INVITES) {
    const token = randomUUID();
    const email = invite.email.toLowerCase().trim();
    const signupUrl = `${APP_URL}/signup?invite=${token}`;

    console.log(`--- ${email} ---`);

    // 1. Insert into beta_invites
    const { data, error } = await supabase
      .from('beta_invites')
      .insert({
        email,
        token,
        plan: PLAN,
        duration_days: DURATION_DAYS,
        note: NOTE,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error(`  DB insert FAILED: ${error.message}`);
      results.push({ email, success: false, error: error.message });
      continue;
    }
    console.log(`  DB: Inserted invite ${data.id}`);

    // 2. Send email
    try {
      const emailResult = await resend.emails.send({
        from: `Shiny Jets CRM <${FROM_EMAIL}>`,
        to: email,
        subject: "You're invited to try Shiny Jets CRM — 6 months free",
        html: buildEmailHtml(email, token),
        text: `You're invited to Shiny Jets CRM!\n\nYou've been personally invited to try Shiny Jets CRM — the first CRM built exclusively for aircraft detailers.\n\n6 months of Pro access — completely free. No credit card required.\n\nAccept your invitation: ${signupUrl}\n\nThis invite is for ${email} only and can be used once.`,
      });

      if (emailResult.error) {
        console.error(`  Email FAILED: ${JSON.stringify(emailResult.error)}`);
        results.push({ email, success: false, error: emailResult.error, signupUrl });
      } else {
        console.log(`  Email: Sent successfully (id: ${emailResult.data?.id})`);
        results.push({ email, success: true, signupUrl, emailId: emailResult.data?.id });
      }
    } catch (err) {
      console.error(`  Email FAILED: ${err.message}`);
      results.push({ email, success: false, error: err.message, signupUrl });
    }
  }

  console.log('\n=== Results ===\n');
  for (const r of results) {
    console.log(`${r.success ? '✓' : '✗'} ${r.email}`);
    console.log(`  URL: ${r.signupUrl}`);
    if (!r.success) console.log(`  Error: ${r.error}`);
    console.log('');
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`${successCount}/${results.length} invites sent successfully.`);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
