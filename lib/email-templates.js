/**
 * Email Templates for Vector
 * Clean, professional HTML email templates
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';
const BRAND_COLOR = '#1e3a5f';
const SUCCESS_COLOR = '#059669';
const WARNING_COLOR = '#d97706';

/**
 * Base email wrapper
 */
function emailWrapper(content, { headerBg = BRAND_COLOR, headerText = '' } = {}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerText}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
  <div style="background: ${headerBg}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${headerText}</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    ${content}
  </div>
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">Powered by <strong>Vector</strong> - Aircraft Detailing Software</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
}

/**
 * Format services list
 */
function formatServices(services) {
  if (!services) return [];
  const labels = {
    exterior: 'Exterior Wash & Detail',
    interior: 'Interior Detail',
    brightwork: 'Brightwork Polish',
    ceramic: 'Ceramic Coating',
    engine: 'Engine Detail',
  };
  return Object.entries(services)
    .filter(([key, value]) => value === true)
    .map(([key]) => labels[key] || key);
}

/**
 * Format line items for email display
 */
function formatLineItems(lineItems) {
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) return [];
  return lineItems.filter(item => item.description && item.amount > 0);
}

/**
 * QUOTE SENT - Email to customer when detailer sends quote
 */
export function quoteSentTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, services, line_items, valid_until, notes, discount_percent, addon_fees, addon_total, airport } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const lineItems = formatLineItems(line_items);
  const servicesList = lineItems.length > 0 ? [] : formatServices(services);
  const validDate = valid_until ? new Date(valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const discountPct = parseFloat(discount_percent) || 0;

  // Build service rows HTML
  let serviceRowsHtml = '';
  let serviceRowsText = '';
  if (lineItems.length > 0) {
    serviceRowsHtml = lineItems.map(item => `
        <tr>
          <td style="padding: 6px 0; color: #374151;">${item.description}</td>
          <td style="padding: 6px 0; text-align: right; color: #374151;">${formatCurrency(item.amount)}</td>
        </tr>`).join('');
    serviceRowsText = lineItems.map(item => `  ${item.description}: ${formatCurrency(item.amount)}`).join('\n');
  } else if (servicesList.length > 0) {
    serviceRowsHtml = `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Services:</td>
          <td style="padding: 8px 0; text-align: right;">
            ${servicesList.map(s => `<div style="font-weight: 500;">${s}</div>`).join('')}
          </td>
        </tr>`;
    serviceRowsText = `Services: ${servicesList.join(', ')}`;
  }

  // Discount row
  const discountRowHtml = discountPct > 0 ? `
        <tr>
          <td style="padding: 6px 0; color: #059669;">Package Discount (${discountPct}%)</td>
          <td style="padding: 6px 0; text-align: right; color: #059669;">-${discountPct}%</td>
        </tr>` : '';

  // Addon rows
  const addons = Array.isArray(addon_fees) ? addon_fees.filter(a => a.name && a.amount > 0) : [];
  const addonRowsHtml = addons.map(a => `
        <tr>
          <td style="padding: 6px 0; color: #374151;">${a.name}</td>
          <td style="padding: 6px 0; text-align: right; color: #374151;">${formatCurrency(a.amount)}</td>
        </tr>`).join('');

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${companyName}</strong> has prepared a quote for your aircraft detailing service.
    </p>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${airport ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Airport:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${airport}</td>
        </tr>
        ` : ''}
        ${lineItems.length > 0 ? `
        <tr>
          <td colspan="2" style="padding: 12px 0 4px 0; color: #6b7280; font-weight: 600; border-top: 1px solid #e5e7eb;">Services:</td>
        </tr>
        ${serviceRowsHtml}
        ${discountRowHtml}
        ${addonRowsHtml}
        ` : serviceRowsHtml}
        ${validDate ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Valid Until:</td>
          <td style="padding: 8px 0; text-align: right;">${validDate}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; color: #1e3a5f; font-weight: 600; font-size: 18px;">Total:</td>
          <td style="padding: 12px 0; border-top: 2px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 24px; color: #1e3a5f;">${amount}</td>
        </tr>
      </table>
    </div>

    ${notes ? `
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Note:</strong> ${notes}</p>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; mso-padding-alt: 0; text-align: center;">
        <!--[if mso]><i style="letter-spacing: 40px; mso-font-width: -100%; mso-text-raise: 24pt;">&nbsp;</i><![endif]-->
        View Quote &amp; Pay
        <!--[if mso]><i style="letter-spacing: 40px; mso-font-width: -100%;">&nbsp;</i><![endif]-->
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Questions? Reply to this email or contact ${companyName} directly.
    </p>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

${companyName} has prepared a quote for your aircraft detailing service.

Aircraft: ${aircraftDisplay}
${airport ? `Airport: ${airport}` : ''}
${serviceRowsText || (servicesList.length > 0 ? `Services: ${servicesList.join(', ')}` : '')}
${discountPct > 0 ? `Package Discount: -${discountPct}%` : ''}
${addons.length > 0 ? addons.map(a => `  ${a.name}: ${formatCurrency(a.amount)}`).join('\n') : ''}
${validDate ? `Valid Until: ${validDate}` : ''}
Total: ${amount}

${notes ? `Note: ${notes}` : ''}

View and pay your quote: ${APP_URL}/q/${share_link}

Questions? Reply to this email or contact ${companyName} directly.
  `.trim();

  return {
    subject: `Your Aircraft Detailing Quote from ${companyName}`,
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: '✈️ Your Quote is Ready' }),
    text,
  };
}

/**
 * QUOTE VIEWED - Email to detailer when customer views quote
 */
export function quoteViewedTemplate({ quote, detailer, viewedAt }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, client_email, client_phone, id } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const viewTime = new Date(viewedAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! <strong>${client_name || 'Your customer'}</strong> just opened your quote.
    </p>

    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #065f46; font-weight: 600;">
        📬 Viewed at ${viewTime}
      </p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Customer:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${client_name || 'Customer'}</td>
        </tr>
        ${client_email ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Email:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="mailto:${client_email}" style="color: #1e3a5f;">${client_email}</a></td>
        </tr>
        ` : ''}
        ${client_phone ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="tel:${client_phone}" style="color: #1e3a5f;">${client_phone}</a></td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #1e3a5f;">${amount}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      This is a great time to follow up if you haven't heard from them!
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/dashboard" style="display: inline-block; background: #1e3a5f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View in Dashboard
      </a>
    </div>
  `;

  const text = `
Hi${detailer?.name ? ` ${detailer.name}` : ''},

Great news! ${client_name || 'Your customer'} just opened your quote.

Viewed at: ${viewTime}

Customer: ${client_name || 'Customer'}
${client_email ? `Email: ${client_email}` : ''}
${client_phone ? `Phone: ${client_phone}` : ''}
Aircraft: ${aircraftDisplay}
Quote Total: ${amount}

This is a great time to follow up if you haven't heard from them!

View in dashboard: ${APP_URL}/dashboard
  `.trim();

  return {
    subject: `Quote Viewed - ${client_name || 'Customer'} opened your quote`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: '👀 Quote Viewed!' }),
    text,
  };
}

/**
 * PAYMENT RECEIVED - Email to detailer when customer pays
 */
export function paymentReceivedTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, client_name, client_email, client_phone, id, services } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const servicesList = formatServices(services);

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      🎉 Great news! Your quote has been approved and paid!
    </p>

    <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px;">Payment Received</p>
      <p style="margin: 0; color: #059669; font-size: 32px; font-weight: 700;">${amount}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Customer:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${client_name || 'Customer'}</td>
        </tr>
        ${client_email ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Email:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="mailto:${client_email}" style="color: #1e3a5f;">${client_email}</a></td>
        </tr>
        ` : ''}
        ${client_phone ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
          <td style="padding: 8px 0; text-align: right;"><a href="tel:${client_phone}" style="color: #1e3a5f;">${client_phone}</a></td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${servicesList.length > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Services:</td>
          <td style="padding: 8px 0; text-align: right;">
            ${servicesList.map(s => `<div>${s}</div>`).join('')}
          </td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Please contact the customer to confirm available dates and schedule the service. The payment will be transferred to your connected Stripe account.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/dashboard" style="display: inline-block; background: #059669; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View in Dashboard
      </a>
    </div>
  `;

  const text = `
Hi${detailer?.name ? ` ${detailer.name}` : ''},

Great news! Your quote has been approved and paid!

Payment Received: ${amount}

Customer: ${client_name || 'Customer'}
${client_email ? `Email: ${client_email}` : ''}
${client_phone ? `Phone: ${client_phone}` : ''}
Aircraft: ${aircraftDisplay}
${servicesList.length > 0 ? `Services: ${servicesList.join(', ')}` : ''}

Please contact the customer to confirm available dates and schedule the service.

View in dashboard: ${APP_URL}/dashboard
  `.trim();

  return {
    subject: `Payment Received - ${amount} for ${aircraftDisplay}`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: '💰 Payment Received!' }),
    text,
  };
}

/**
 * QUOTE ACCEPTED / PAYMENT CONFIRMED - Email to customer after payment
 */
/**
 * RECURRING SERVICE REMINDER - Email to customer about upcoming/new recurring service
 */
export function recurringReminderTemplate({ quote, detailer, isNewQuote }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, next_service_date } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';

  const dateStr = next_service_date
    ? new Date(next_service_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'soon';

  const headerText = isNewQuote ? 'Your Recurring Service is Ready' : 'Upcoming Service Reminder';

  const content = isNewQuote
    ? `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your recurring aircraft detailing service with <strong>${companyName}</strong> is ready for scheduling.
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #1e40af; font-size: 14px;">Service Total</p>
      <p style="margin: 0; color: #1e3a5f; font-size: 28px; font-weight: 700;">${amount}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${aircraftDisplay}</p>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Review and approve your quote to confirm your next service appointment.
    </p>

    ${share_link ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background: #1e3a5f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View &amp; Approve Quote
      </a>
    </div>
    ` : ''}
  `
    : `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      This is a reminder that your recurring aircraft detailing service with <strong>${companyName}</strong> is coming up.
    </p>

    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #92400e; font-size: 14px;">Scheduled For</p>
      <p style="margin: 0; color: #78350f; font-size: 20px; font-weight: 700;">${dateStr}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${aircraftDisplay} - ${amount}</p>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Please ensure your aircraft is accessible on the scheduled date. If you need to reschedule, contact ${companyName} directly.
    </p>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #1e3a5f; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #1e3a5f; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  `;

  const text = isNewQuote
    ? `
Hi${client_name ? ` ${client_name}` : ''},

Your recurring aircraft detailing service with ${companyName} is ready.

Aircraft: ${aircraftDisplay}
Service Total: ${amount}

${share_link ? `Review your quote: ${APP_URL}/q/${share_link}` : ''}
    `.trim()
    : `
Hi${client_name ? ` ${client_name}` : ''},

Reminder: Your recurring service with ${companyName} is scheduled for ${dateStr}.

Aircraft: ${aircraftDisplay}
Amount: ${amount}

Please ensure your aircraft is accessible on the scheduled date.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
    `.trim();

  return {
    subject: isNewQuote
      ? `Recurring Service Ready - ${aircraftDisplay} Detail from ${companyName}`
      : `Service Reminder - ${aircraftDisplay} Detail on ${dateStr}`,
    html: emailWrapper(content, { headerBg: isNewQuote ? BRAND_COLOR : WARNING_COLOR, headerText }),
    text,
  };
}

/**
 * QUOTE ACCEPTED / PAYMENT CONFIRMED - Email to customer after payment
 */
export function paymentConfirmedTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, services, paid_at } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const servicesList = formatServices(services);
  const paidDate = paid_at ? new Date(paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Thank you for your payment! Your aircraft detailing service with <strong>${companyName}</strong> has been confirmed.
    </p>

    <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px;">✓ Payment Confirmed</p>
      <p style="margin: 0; color: #059669; font-size: 28px; font-weight: 700;">${amount}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">${paidDate}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 16px 0; color: #1e3a5f; font-size: 16px;">Service Details</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${servicesList.length > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Services:</td>
          <td style="padding: 8px 0; text-align: right;">
            ${servicesList.map(s => `<div>${s}</div>`).join('')}
          </td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
      </table>
    </div>

    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h4 style="margin: 0 0 8px 0; color: #1e40af;">What's Next?</h4>
      <p style="margin: 0; color: #1e3a5f; font-size: 14px;">
        ${companyName} will contact you shortly to confirm the service date and any preparation details. If you have questions, feel free to reach out to them directly.
      </p>
    </div>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #1e3a5f; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #1e3a5f; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background: #1e3a5f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View Receipt
      </a>
    </div>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Thank you for your payment! Your aircraft detailing service with ${companyName} has been confirmed.

Payment Confirmed: ${amount}
Date: ${paidDate}

Service Details:
- Aircraft: ${aircraftDisplay}
${servicesList.length > 0 ? `- Services: ${servicesList.join(', ')}` : ''}
- Provider: ${companyName}

What's Next?
${companyName} will contact you shortly to confirm the service date and any preparation details.

${detailer?.email || detailer?.phone ? `Contact ${companyName}: ${detailer?.email || ''} ${detailer?.phone || ''}` : ''}

View your receipt: ${APP_URL}/q/${share_link}
  `.trim();

  return {
    subject: `Payment Confirmed - ${companyName} Aircraft Detailing`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: '✓ Payment Confirmed' }),
    text,
  };
}
