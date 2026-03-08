import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const rawBody = await request.text();
  const signature = request.headers.get('x-shopify-hmac-sha256');
  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  if (computedHmac !== signature) {
    return new Response('Invalid signature', { status: 401 });
  }
  const topic = request.headers.get('x-shopify-topic');
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    payload = {};
  }
  await supabase.from('webhook_logs').insert({
    source: 'shopify',
    topic,
    payload,
    processed: false,
  });

  function generateTempPassword() {
    const adjectives = ['Swift','Bright','Shiny','Aero','Smooth','Rapid','Sleek','Bold'];
    const nouns = ['Jet','Wing','Sky','Tail','Eagle','Falcon','Hawk','Cloud'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${adj}${noun}${num}`;
  }
  async function sendSMS(to, message) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !from) return;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append('From', from);
    params.append('To', to);
    params.append('Body', message);
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
  }
  async function sendEmail(to, subject, html) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, from: 'Vector <noreply@vectorav.ai>', subject, html }),
    });
  }

  if (topic === 'orders/paid') {
    const lineItems = payload?.line_items || [];
    const vectorItem = lineItems.find(item => item.sku && item.sku.startsWith('VECTOR-'));
    if (!vectorItem) {
      return new Response('OK', { status: 200 });
    }
    const planSku = vectorItem.sku;
    let plan = 'starter';
    if (planSku.includes('BUSINESS')) plan = 'business';
    else if (planSku.includes('PRO')) plan = 'pro';
    else if (planSku.includes('STARTER')) plan = 'starter';
    const email = payload?.customer?.email;
    const name = payload?.customer?.first_name ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim() : 'Customer';
    const phone = payload?.customer?.phone || null;
    const { data: existingDetailer } = await supabase.from('detailers').select().eq('email', email).maybeSingle();
    if (existingDetailer) {
      if (existingDetailer.status === 'suspended') {
        await supabase.from('detailers').update({ status: 'active', plan }).eq('id', existingDetailer.id);
        if (phone) {
          await sendSMS(phone, `Your Vector account has been reactivated. Login at app.aircraftdetailing.ai`);
        }
      } else {
        await supabase.from('detailers').update({ plan }).eq('id', existingDetailer.id);
      }
    } else {
      const tempPassword = generateTempPassword();
      const bcrypt = (await import('bcryptjs')).default;
      const hashed = bcrypt.hashSync(tempPassword, 10);
      const { data: inserted } = await supabase
        .from('detailers')
        .insert({
          email,
          name,
          phone,
          password_hash: hashed,
          must_change_password: true,
          status: 'active',
          plan,
        })
        .select()
        .maybeSingle();
      if (inserted) {
        if (phone) {
          await sendSMS(phone, `Welcome to Vector, ${name}! Your account is ready at app.aircraftdetailing.ai. Temp password: ${tempPassword}`);
        }
        if (email) {
          await sendEmail(
            email,
            'Welcome to Vector',
            `<p>Hello ${name},</p><p>Your Vector account is ready. Your temporary password is <strong>${tempPassword}</strong>. Please log in at <a href="https://app.aircraftdetailing.ai">app.aircraftdetailing.ai</a> and complete onboarding.</p>`
          );
        }
        const now = new Date();
        const offsets = [0, 1, 3, 5, 7];
        const dripRows = offsets.map(offset => {
          const scheduled = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
          return {
            detailer_id: inserted.id,
            message_id: `drip-day-${offset}`,
            scheduled_for: scheduled.toISOString(),
          };
        });
        await supabase.from('drip_messages').insert(dripRows);
      }
    }
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await sendSMS(adminPhone, `Shopify order paid for ${email} plan ${plan}.`);
    }
  } else if (topic === 'subscription_billing_attempts/failure') {
    const email = payload?.customer?.email;
    const customerId = payload?.customer_id;
    const { data: detailer } = await supabase
      .from('detailers')
      .select()
      .or(`shopify_customer_id.eq.${customerId},email.eq.${email}`)
      .maybeSingle();
    if (detailer) {
      await supabase.from('detailers').update({ status: 'suspended' }).eq('id', detailer.id);
      if (detailer.phone) {
        await sendSMS(detailer.phone, 'Your Vector payment failed. Account paused. Update at app.aircraftdetailing.ai/billing');
      }
    }
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await sendSMS(adminPhone, `Shopify payment failed for customer ${email || customerId}.`);
    }
  } else if (topic === 'subscription_billing_attempts/success') {
    const email = payload?.customer?.email;
    const customerId = payload?.customer_id;
    const { data: detailer } = await supabase
      .from('detailers')
      .select()
      .or(`shopify_customer_id.eq.${customerId},email.eq.${email}`)
      .maybeSingle();
    if (detailer) {
      if (detailer.status === 'suspended') {
        await supabase.from('detailers').update({ status: 'active' }).eq('id', detailer.id);
        if (detailer.phone) {
          await sendSMS(detailer.phone, 'Your Vector account has been reactivated. Thank you for your payment.');
        }
      }
    }
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await sendSMS(adminPhone, `Shopify payment succeeded for customer ${email || customerId}.`);
    }
  } else if (topic === 'subscription_contracts/cancel') {
    const email = payload?.customer?.email;
    const customerId = payload?.customer_id;
    const { data: detailer } = await supabase
      .from('detailers')
      .select()
      .or(`shopify_customer_id.eq.${customerId},email.eq.${email}`)
      .maybeSingle();
    if (detailer) {
      await supabase.from('detailers').update({ status: 'cancelled' }).eq('id', detailer.id);
    }
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await sendSMS(adminPhone, `Shopify subscription canceled for customer ${email || customerId}.`);
    }
  } else if (topic === 'subscription_contracts/update') {
    const email = payload?.customer?.email;
    const customerId = payload?.customer_id;
    const newPlanSku = payload?.line_items?.[0]?.sku || '';
    let newPlan = 'starter';
    if (newPlanSku.includes('BUSINESS')) newPlan = 'business';
    else if (newPlanSku.includes('PRO')) newPlan = 'pro';
    else if (newPlanSku.includes('STARTER')) newPlan = 'starter';
    const { data: detailer } = await supabase
      .from('detailers')
      .select()
      .or(`shopify_customer_id.eq.${customerId},email.eq.${email}`)
      .maybeSingle();
    if (detailer) {
      await supabase.from('detailers').update({ plan: newPlan }).eq('id', detailer.id);
    }
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await sendSMS(adminPhone, `Shopify subscription updated for customer ${email || customerId} to plan ${newPlan}.`);
    }
  }
  return new Response('OK', { status: 200 });
}


              
