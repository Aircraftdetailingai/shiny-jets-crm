import {
  quoteSentTemplate,
  quoteViewedTemplate,
  paymentReceivedTemplate,
  paymentConfirmedTemplate,
  recurringReminderTemplate,
  jobScheduledTemplate,
  jobReminderTemplate,
  jobCompletedTemplate,
  followUpTemplate,
  welcomeTemplate,
  invoiceTemplate,
  feedbackRequestTemplate,
  quoteExpiringTemplate,
  quoteExpiredDetailerTemplate,
  lowStockAlertTemplate,
  followUpReminderTemplate,
  expiryDiscountTemplate,
  betaInviteTemplate,
  bookingReceivedDetailerTemplate,
  monthlyReportTemplate,
  staffingAlertTemplate,
  weeklyDigestTemplate,
  followupNotViewedTemplate,
  followupViewedNotAcceptedTemplate,
  followupExpiryWarningTemplate,
  customerIntroTemplate,
  referralRewardReferrerTemplate,
  referralRewardReferredTemplate,
  followupAvailabilityConflictTemplate,
  followupExpiredRecoveryTemplate,
  invoiceReminderTemplate,
  bookingConfirmedTemplate,
} from './email-templates';

import { Resend } from 'resend';

let _resend;
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.error('[resend] RESEND_API_KEY is not set');
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// TEMPORARY: use onboarding@resend.dev until shinyjets.com domain is verified in Resend
// Once verified, switch back to: 'Shiny Jets CRM <noreply@shinyjets.com>'
const FROM_EMAIL = 'Shiny Jets CRM <onboarding@resend.dev>';
const DEFAULT_REPLY_TO = 'support@shinyjets.com';

/**
 * Get branded FROM address using detailer's company name
 * e.g., "Elite Aviation Detail <noreply@shinyjets.com>"
 */
function getBrandedFrom(detailer) {
  const companyName = detailer?.company || detailer?.name || 'Shiny Jets CRM';
  const fromDomain = (FROM_EMAIL.match(/<([^>]+)>/) || [null, FROM_EMAIL])[1];
  return `${companyName} <${fromDomain}>`;
}

/**
 * Core email sending function
 */
async function sendEmail({ to, subject, html, text, replyTo, from }) {
  try {
    const fromAddr = from || FROM_EMAIL;
    console.log(`Sending email: from=${fromAddr} to=${to} subject=${subject}`);

    const { data, error } = await getResend().emails.send({
      from: fromAddr,
      to,
      subject,
      html,
      text,
      reply_to: replyTo || DEFAULT_REPLY_TO,
      headers: {
        'List-Unsubscribe': `<mailto:unsubscribe@shinyjets.com?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    console.log('[resend-response]', JSON.stringify({ data, error }));

    if (error) {
      console.error('Resend error:', JSON.stringify(error));
      return { success: false, error: error.message || JSON.stringify(error) };
    }

    console.log(`Email sent successfully: ${data?.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Failed to send email:', error.message || error);
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Send quote to customer
 */
export async function sendQuoteSentEmail({ quote, detailer, language, customSubject, customBody }) {
  if (!quote.client_email) {
    console.log('No client email, skipping quote sent email');
    return { success: false, error: 'No client email' };
  }

  const template = quoteSentTemplate({ quote, detailer, language });
  const brandedFrom = getBrandedFrom(detailer);

  // Use custom subject/body from the compose step if provided
  const subject = customSubject || template.subject;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
  const quoteLink = `${appUrl}/q/${quote.share_link}`;
  const html = customBody
    ? `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;">${customBody.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p><p style="margin-top:20px;"><a href="${quoteLink}" style="background:#007CB1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Review Your Quote</a></p></div>`
    : template.html;
  const text = customBody ? `${customBody}\n\nReview your quote: ${quoteLink}` : template.text;

  return sendEmail({
    to: quote.client_email,
    subject,
    html,
    text,
    replyTo: detailer?.email,
    from: brandedFrom,
  });
}

/**
 * Notify detailer when customer views quote
 */
export async function sendQuoteViewedEmail({ quote, detailer, viewedAt }) {
  if (!detailer?.email) {
    console.log('No detailer email, skipping quote viewed notification');
    return { success: false, error: 'No detailer email' };
  }

  const template = quoteViewedTemplate({ quote, detailer, viewedAt });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send payment received notification to detailer
 */
export async function sendPaymentReceivedEmail({ quote, detailer, feeBreakdown }) {
  if (!detailer?.email) {
    console.log('No detailer email, skipping payment received notification');
    return { success: false, error: 'No detailer email' };
  }

  // Support both old and new parameter format
  const detailerEmail = detailer.email;

  const template = paymentReceivedTemplate({ quote, detailer, feeBreakdown });

  return sendEmail({
    to: detailerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send payment confirmation to customer
 */
export async function sendPaymentConfirmedEmail({ quote, detailer, feeBreakdown }) {
  if (!quote.client_email) {
    console.log('No client email, skipping payment confirmation');
    return { success: false, error: 'No client email' };
  }

  const template = paymentConfirmedTemplate({ quote, detailer, feeBreakdown });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send recurring service reminder to customer
 */
export async function sendRecurringReminderEmail({ quote, detailer, isNewQuote }) {
  if (!quote.client_email) {
    console.log('No client email, skipping recurring reminder');
    return { success: false, error: 'No client email' };
  }

  const template = recurringReminderTemplate({ quote, detailer, isNewQuote });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send job scheduled confirmation to customer
 */
export async function sendJobScheduledEmail({ quote, detailer, scheduledDate }) {
  if (!quote.client_email) {
    console.log('No client email, skipping job scheduled email');
    return { success: false, error: 'No client email' };
  }

  const template = jobScheduledTemplate({ quote, detailer, scheduledDate });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send booking received notification to detailer (when customer self-schedules)
 */
export async function sendBookingReceivedEmail({ quote, detailer, scheduledDate, timePreference, schedulingNotes }) {
  if (!detailer?.email) {
    console.log('No detailer email, skipping booking received email');
    return { success: false, error: 'No detailer email' };
  }

  const template = bookingReceivedDetailerTemplate({ quote, detailer, scheduledDate, timePreference, schedulingNotes });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    from: FROM_EMAIL,
  });
}

/**
 * Send job reminder to customer (day before service)
 */
export async function sendJobReminderEmail({ quote, detailer, serviceDate }) {
  if (!quote.client_email) {
    console.log('No client email, skipping job reminder');
    return { success: false, error: 'No client email' };
  }

  const template = jobReminderTemplate({ quote, detailer, serviceDate });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send job completed notification to customer
 */
export async function sendJobCompletedEmail({ quote, detailer, completedAt }) {
  if (!quote.client_email) {
    console.log('No client email, skipping job completed email');
    return { success: false, error: 'No client email' };
  }

  const template = jobCompletedTemplate({ quote, detailer, completedAt });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send follow-up email to customer (7 days after quote sent)
 */
export async function sendFollowUpEmail({ quote, detailer }) {
  if (!quote.client_email) {
    console.log('No client email, skipping follow-up');
    return { success: false, error: 'No client email' };
  }

  const template = followUpTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send welcome email to new detailer
 */
export async function sendWelcomeEmail({ detailer }) {
  if (!detailer?.email) {
    console.log('No detailer email, skipping welcome email');
    return { success: false, error: 'No detailer email' };
  }

  const template = welcomeTemplate({ detailer });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send invoice to customer
 */
export async function sendInvoiceEmail({ invoice }) {
  if (!invoice.customer_email) {
    console.log('No customer email, skipping invoice email');
    return { success: false, error: 'No customer email' };
  }

  const template = invoiceTemplate({ invoice });

  return sendEmail({
    to: invoice.customer_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: invoice.detailer_email,
    from: getBrandedFrom({ company: invoice.detailer_company, name: invoice.detailer_name }),
  });
}

/**
 * Send invoice payment reminder to customer
 */
export async function sendInvoiceReminderEmail({ invoice }) {
  if (!invoice.customer_email) {
    console.log('No customer email, skipping invoice reminder');
    return { success: false, error: 'No customer email' };
  }

  const template = invoiceReminderTemplate({ invoice });

  return sendEmail({
    to: invoice.customer_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: invoice.detailer_email,
    from: getBrandedFrom({ company: invoice.detailer_company, name: invoice.detailer_name }),
  });
}

/**
 * Send feedback request to customer after job completion
 */
export async function sendFeedbackRequestEmail({ quote, detailer }) {
  if (!quote.client_email) {
    console.log('No client email, skipping feedback request');
    return { success: false, error: 'No client email' };
  }

  const template = feedbackRequestTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send quote expiring warning to customer (24hr before)
 */
export async function sendQuoteExpiringEmail({ quote, detailer }) {
  if (!quote.client_email) {
    return { success: false, error: 'No client email' };
  }

  const template = quoteExpiringTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send quote expired notification to detailer
 */
export async function sendQuoteExpiredDetailerEmail({ quote, detailer }) {
  if (!detailer?.email) {
    return { success: false, error: 'No detailer email' };
  }

  const template = quoteExpiredDetailerTemplate({ quote, detailer });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send low stock alert to detailer
 */
export async function sendLowStockAlertEmail({ products, detailer }) {
  if (!detailer?.email) {
    console.log('No detailer email, skipping low stock alert');
    return { success: false, error: 'No detailer email' };
  }

  const template = lowStockAlertTemplate({ products, detailer });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send follow-up reminder email to customer (5 days before expiry)
 */
export async function sendFollowUpReminderEmail({ to, clientName, aircraft, quoteUrl, expiresIn, detailerName, detailerPhone }) {
  if (!to) {
    return { success: false, error: 'No recipient email' };
  }

  const template = followUpReminderTemplate({ clientName, aircraft, quoteUrl, expiresIn, detailerName, detailerPhone });

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    from: getBrandedFrom({ name: detailerName }),
  });
}

/**
 * Send expiry discount email to customer (2 days before expiry)
 */
export async function sendExpiryDiscountEmail({ to, clientName, aircraft, quoteUrl, discountPercent, originalPrice, discountedPrice, detailerName, detailerPhone, currency }) {
  if (!to) {
    return { success: false, error: 'No recipient email' };
  }

  const template = expiryDiscountTemplate({ clientName, aircraft, quoteUrl, discountPercent, originalPrice, discountedPrice, detailerName, detailerPhone, currency });

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    from: getBrandedFrom({ name: detailerName }),
  });
}

/**
 * Send monthly revenue report to detailer
 */
export async function sendMonthlyReportEmail({ detailer, monthLabel, stats }) {
  if (!detailer?.email) {
    console.log('No detailer email, skipping monthly report');
    return { success: false, error: 'No detailer email' };
  }

  const template = monthlyReportTemplate({ detailer, monthLabel, stats });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send beta invite email
 */
export async function sendBetaInviteEmail({ email, plan, durationDays, note, token }) {
  const template = betaInviteTemplate({ email, plan, durationDays, note, token });
  return sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send team member invite email
 */
export async function sendTeamInviteEmail({ to, memberName, inviterName, company, role, inviteUrl }) {
  if (!to) return { success: false, error: 'No recipient email' };

  const roleName = (role || 'team member').replace('_', ' ');
  const companyName = company || 'our team';
  const greeting = memberName ? `Hi ${memberName},` : 'Hi,';

  const subject = `You've been invited to join ${companyName} on Shiny Jets CRM`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f0f0ee;">
  <div style="background:linear-gradient(135deg,#007CB1 0%,#0a1520 100%);padding:36px 30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#fff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Shiny Jets CRM</span>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">Team Invitation</p>
  </div>
  <div style="background:#fff;padding:32px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1a2236;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;color:#4a5568;margin-bottom:16px;">
      <strong>${companyName}</strong> has invited you to join their team on Shiny Jets CRM.
    </p>
    <p style="font-size:14px;color:#718096;margin-bottom:24px;">
      Click below to set up your account and get started.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${inviteUrl}" style="display:inline-block;background:#007CB1;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:6px;font-weight:600;font-size:15px;">
        Accept Invitation &rarr;
      </a>
    </div>
    <p style="font-size:13px;color:#a0aec0;text-align:center;margin-bottom:0;">This invitation expires in 7 days.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">Shiny Jets CRM</p>
</body></html>`;

  const text = `${greeting}\n\n${companyName} has invited you to join their team on Shiny Jets CRM.\n\nClick below to set up your account and get started:\n${inviteUrl}\n\nThis invitation expires in 7 days.\n\nShiny Jets CRM`;

  return sendEmail({ to, subject, html, text, from: 'Shiny Jets CRM <noreply@shinyjets.com>' });
}

/**
 * Send notification to existing account that they've been added to a team
 */
export async function sendTeamAddedEmail({ to, memberName, company }) {
  if (!to) return { success: false, error: 'No recipient email' };

  const companyName = company || 'a team';
  const greeting = memberName ? `Hi ${memberName},` : 'Hi,';

  const subject = `You've been added to ${companyName}'s team`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f0f0ee;">
  <div style="background:linear-gradient(135deg,#007CB1 0%,#0a1520 100%);padding:36px 30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#fff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Shiny Jets CRM</span>
  </div>
  <div style="background:#fff;padding:32px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1a2236;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;color:#4a5568;margin-bottom:16px;">
      You've been added to <strong>${companyName}</strong>'s team on Shiny Jets CRM.
    </p>
    <p style="font-size:14px;color:#718096;margin-bottom:24px;">
      Log in with your existing account to access the team dashboard, view assigned jobs, and log hours.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://crm.shinyjets.com/login" style="display:inline-block;background:#007CB1;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:6px;font-weight:600;font-size:15px;">
        Go to Dashboard &rarr;
      </a>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">Shiny Jets CRM</p>
</body></html>`;

  const text = `${greeting}\n\nYou've been added to ${companyName}'s team on Shiny Jets CRM.\n\nLog in at https://crm.shinyjets.com/login\n\nShiny Jets CRM`;

  return sendEmail({ to, subject, html, text, from: 'Shiny Jets CRM <noreply@shinyjets.com>' });
}

/**
 * Send staffing alert email to detailer
 */
export async function sendStaffingAlertEmail({ quote, detailer, scheduledDate, daysOut }) {
  if (!detailer?.email) {
    return { success: false, error: 'No detailer email' };
  }

  const template = staffingAlertTemplate({ quote, detailer, scheduledDate, daysOut });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send weekly digest email to detailer
 */
export async function sendWeeklyDigestEmail({ detailer, thisWeekJobs, needsStaffJobs, unscheduledJobs }) {
  if (!detailer?.email) {
    return { success: false, error: 'No detailer email' };
  }

  const template = weeklyDigestTemplate({ detailer, thisWeekJobs, needsStaffJobs, unscheduledJobs });

  return sendEmail({
    to: detailer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send follow-up email when quote hasn't been viewed
 */
export async function sendFollowupNotViewedEmail({ quote, detailer }) {
  if (!quote.client_email) {
    return { success: false, error: 'No client email' };
  }

  const template = followupNotViewedTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send follow-up email when quote was viewed but not accepted
 */
export async function sendFollowupViewedNotAcceptedEmail({ quote, detailer, availableDates }) {
  if (!quote.client_email) {
    return { success: false, error: 'No client email' };
  }

  const template = followupViewedNotAcceptedTemplate({ quote, detailer, availableDates });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send follow-up email warning quote is about to expire
 */
export async function sendFollowupExpiryWarningEmail({ quote, detailer, availableDates }) {
  if (!quote.client_email) {
    return { success: false, error: 'No client email' };
  }

  const template = followupExpiryWarningTemplate({ quote, detailer, availableDates });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send follow-up email when scheduled date has availability conflict
 */
export async function sendFollowupAvailabilityConflictEmail({ quote, detailer, alternativeDates }) {
  if (!quote.client_email) {
    return { success: false, error: 'No client email' };
  }

  const template = followupAvailabilityConflictTemplate({ quote, detailer, alternativeDates });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send expired quote recovery email
 */
export async function sendFollowupExpiredRecoveryEmail({ quote, detailer }) {
  if (!quote.client_email) {
    return { success: false, error: 'No client email' };
  }

  const template = followupExpiredRecoveryTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Send referral reward notification to referrer
 */
export async function sendReferralRewardReferrerEmail({ referrer, referredName, pointsEarned }) {
  if (!referrer?.email) {
    return { success: false, error: 'No referrer email' };
  }

  const template = referralRewardReferrerTemplate({ referrer, referredName, pointsEarned });

  return sendEmail({
    to: referrer.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send referral reward notification to referred user
 */
export async function sendReferralRewardReferredEmail({ referred, pointsEarned }) {
  if (!referred?.email) {
    return { success: false, error: 'No referred email' };
  }

  const template = referralRewardReferredTemplate({ referred, pointsEarned });

  return sendEmail({
    to: referred.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send booking confirmation to customer (book_later mode)
 */
export async function sendBookingConfirmedEmail({ quote, detailer }) {
  if (!quote.client_email) {
    console.log('No client email, skipping booking confirmation');
    return { success: false, error: 'No client email' };
  }

  const template = bookingConfirmedTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}

/**
 * Format currency for display
 */
export function formatCurrency(amount, currency = 'USD') {
  const localeMap = {
    USD: 'en-US', CAD: 'en-CA', EUR: 'de-DE', GBP: 'en-GB', AUD: 'en-AU',
    MXN: 'es-MX', BRL: 'pt-BR',
  };
  return new Intl.NumberFormat(localeMap[currency] || 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount || 0);
}

/**
 * Send customer introduction email (from onboarding)
 */
export async function sendCustomerIntroEmail({ customerEmail, customerName, detailer }) {
  if (!customerEmail) {
    return { success: false, error: 'No customer email' };
  }
  const template = customerIntroTemplate({
    customerName: customerName || '',
    detailerCompany: detailer?.company || detailer?.name || 'Your detailer',
    detailerName: detailer?.name || '',
  });
  return sendEmail({
    to: customerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
    from: getBrandedFrom(detailer),
  });
}
