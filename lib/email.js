import { Resend } from 'resend';
import {
  quoteSentTemplate,
  quoteViewedTemplate,
  paymentReceivedTemplate,
  paymentConfirmedTemplate,
  recurringReminderTemplate,
  jobReminderTemplate,
  jobCompletedTemplate,
  followUpTemplate,
  welcomeTemplate,
} from './email-templates';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Vector <quotes@downwindpro.com>';

/**
 * Core email sending function
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  try {
    console.log(`Sending email: from=${FROM_EMAIL} to=${to} subject=${subject}`);

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      reply_to: replyTo,
    });

    if (error) {
      console.error('Resend error:', JSON.stringify(error));
      return { success: false, error: error.message || JSON.stringify(error) };
    }

    console.log(`Email sent successfully: ${data.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Failed to send email:', error.message || error);
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Send quote to customer
 */
export async function sendQuoteSentEmail({ quote, detailer }) {
  if (!quote.client_email) {
    console.log('No client email, skipping quote sent email');
    return { success: false, error: 'No client email' };
  }

  const template = quoteSentTemplate({ quote, detailer });

  return sendEmail({
    to: quote.client_email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    replyTo: detailer?.email,
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
 * Format currency for display
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
}
