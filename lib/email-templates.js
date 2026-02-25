/**
 * Email Templates for Vector
 * Clean, professional HTML email templates
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';
const BRAND_COLOR = '#1e3a5f';
const SUCCESS_COLOR = '#059669';
const WARNING_COLOR = '#d97706';
const INFO_COLOR = '#2563eb';

/**
 * Base email wrapper with Vector logo, detailer branding, and unsubscribe link
 */
function emailWrapper(content, { headerBg = BRAND_COLOR, headerText = '', companyName = '', unsubscribeEmail = '' } = {}) {
  const unsubscribeHtml = unsubscribeEmail
    ? `<p style="margin: 8px 0 0 0;"><a href="mailto:${unsubscribeEmail}?subject=Unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a></p>`
    : `<p style="margin: 8px 0 0 0;"><a href="mailto:support@vectorav.ai?subject=Unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a></p>`;

  const companyLine = companyName
    ? `<p style="color: #cbd5e1; margin: 8px 0 0 0; font-size: 14px;">from ${companyName}</p>`
    : '';

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
    <div style="margin-bottom: 12px;">
      <span style="color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">&#9992;&#65039; Vector</span>
    </div>
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">${headerText}</h1>
    ${companyLine}
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    ${content}
  </div>
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">Powered by <a href="https://vectorav.ai" style="color: #9ca3af; text-decoration: underline;">Vector</a> - Aircraft Detailing Software</p>
    ${unsubscribeHtml}
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
    html: emailWrapper(content, { headerText: 'Your Quote is Ready', companyName, unsubscribeEmail: detailer?.email }),
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
        Viewed at ${viewTime}
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
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: 'Quote Viewed!' }),
    text,
  };
}

/**
 * PAYMENT RECEIVED - Email to detailer when customer pays
 */
export function paymentReceivedTemplate({ quote, detailer, feeBreakdown }) {
  const { aircraft_model, aircraft_type, total_price, client_name, client_email, client_phone, id, services } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const servicesList = formatServices(services);
  const platformFee = feeBreakdown?.platformFee || 0;
  const feeRate = feeBreakdown?.feeRate || 0;
  const yourPayout = feeBreakdown?.yourPayout || total_price;

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! Your quote has been approved and paid!
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

    ${platformFee > 0 ? `
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 4px 0; color: #92400e; font-size: 14px;">Quote Total:</td>
          <td style="padding: 4px 0; text-align: right; color: #92400e; font-size: 14px;">${amount}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #92400e; font-size: 14px;">Platform Fee (${(feeRate * 100).toFixed(0)}%):</td>
          <td style="padding: 4px 0; text-align: right; color: #92400e; font-size: 14px;">-${formatCurrency(platformFee)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #fde68a; color: #78350f; font-weight: 600;">Your Payout:</td>
          <td style="padding: 8px 0; border-top: 1px solid #fde68a; text-align: right; color: #78350f; font-weight: 700; font-size: 16px;">${formatCurrency(yourPayout)}</td>
        </tr>
      </table>
    </div>
    ` : ''}

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
${platformFee > 0 ? `Platform Fee (${(feeRate * 100).toFixed(0)}%): -${formatCurrency(platformFee)}
Your Payout: ${formatCurrency(yourPayout)}` : ''}

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
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: 'Payment Received!' }),
    text,
  };
}

/**
 * PAYMENT CONFIRMED - Email to customer after payment
 */
export function paymentConfirmedTemplate({ quote, detailer, feeBreakdown }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, services, paid_at } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const servicesList = formatServices(services);
  const paidDate = paid_at ? new Date(paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const platformFee = feeBreakdown?.platformFee || 0;
  const feeRate = feeBreakdown?.feeRate || 0;
  const customerPaid = feeBreakdown?.customerPaid || total_price;

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Thank you for your payment! Your aircraft detailing service with <strong>${companyName}</strong> has been confirmed.
    </p>

    <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px;">Payment Confirmed</p>
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
        ${platformFee > 0 ? `
        <tr>
          <td colspan="2" style="padding: 12px 0 0 0; border-top: 1px solid #e5e7eb;"></td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Service Total:</td>
          <td style="padding: 4px 0; text-align: right;">${formatCurrency(total_price)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6b7280;">Service Fee (${(feeRate * 100).toFixed(0)}%):</td>
          <td style="padding: 4px 0; text-align: right;">${formatCurrency(platformFee)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; font-weight: 600; color: #1e3a5f;">Total Charged:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; color: #1e3a5f;">${formatCurrency(customerPaid)}</td>
        </tr>
        ` : ''}
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
${platformFee > 0 ? `
Fee Breakdown:
- Service Total: ${formatCurrency(total_price)}
- Service Fee (${(feeRate * 100).toFixed(0)}%): ${formatCurrency(platformFee)}
- Total Charged: ${formatCurrency(customerPaid)}
` : ''}
What's Next?
${companyName} will contact you shortly to confirm the service date and any preparation details.

${detailer?.email || detailer?.phone ? `Contact ${companyName}: ${detailer?.email || ''} ${detailer?.phone || ''}` : ''}

View your receipt: ${APP_URL}/q/${share_link}
  `.trim();

  return {
    subject: `Payment Confirmed - ${companyName} Aircraft Detailing`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: 'Payment Confirmed', companyName, unsubscribeEmail: detailer?.email }),
    text,
  };
}

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
    html: emailWrapper(content, { headerBg: isNewQuote ? BRAND_COLOR : WARNING_COLOR, headerText, companyName, unsubscribeEmail: detailer?.email }),
    text,
  };
}

/**
 * JOB REMINDER - Email to customer the day before scheduled service
 */
export function jobReminderTemplate({ quote, detailer, serviceDate }) {
  const { aircraft_model, aircraft_type, total_price, client_name, airport } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const dateStr = serviceDate
    ? new Date(serviceDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'tomorrow';

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Just a friendly reminder that your aircraft detailing service with <strong>${companyName}</strong> is scheduled for <strong>${dateStr}</strong>.
    </p>

    <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 4px 0; color: #1e40af; font-size: 14px;">Scheduled Service</p>
      <p style="margin: 0; color: #1e3a5f; font-size: 20px; font-weight: 700;">${dateStr}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        ${airport ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Location:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${airport}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #1e3a5f;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Preparation:</strong> Please ensure your aircraft is accessible and the area is clear for the detailing crew to work.</p>
    </div>

    ${detailer?.email || detailer?.phone ? `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Need to reschedule? Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #1e3a5f; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #1e3a5f; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Reminder: Your aircraft detailing service with ${companyName} is scheduled for ${dateStr}.

Aircraft: ${aircraftDisplay}
${airport ? `Location: ${airport}` : ''}
Provider: ${companyName}
Quote Total: ${amount}

Please ensure your aircraft is accessible and the area is clear for the detailing crew.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
  `.trim();

  return {
    subject: `Service Tomorrow - ${aircraftDisplay} Detail with ${companyName}`,
    html: emailWrapper(content, { headerBg: INFO_COLOR, headerText: 'Service Reminder', companyName, unsubscribeEmail: detailer?.email }),
    text,
  };
}

/**
 * JOB COMPLETED - Email to customer when detailer marks job complete
 */
export function jobCompletedTemplate({ quote, detailer, completedAt }) {
  const { aircraft_model, aircraft_type, total_price, client_name, share_link } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const completedDate = completedAt
    ? new Date(completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your aircraft detailing service has been completed by <strong>${companyName}</strong>. We hope your aircraft looks fantastic!
    </p>

    <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px;">Service Complete</p>
      <p style="margin: 0; color: #059669; font-size: 20px; font-weight: 700;">${aircraftDisplay}</p>
      <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">${completedDate}</p>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #1e3a5f;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h4 style="margin: 0 0 8px 0; color: #1e40af;">How was your experience?</h4>
      <p style="margin: 0; color: #1e3a5f; font-size: 14px;">
        If you were satisfied with the service, we'd appreciate a review or referral. If anything needs attention, please contact ${companyName} directly.
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
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Your aircraft detailing service has been completed by ${companyName}.

Aircraft: ${aircraftDisplay}
Completed: ${completedDate}
Total: ${amount}

If you were satisfied with the service, we'd appreciate a review or referral.

${detailer?.email ? `Contact: ${detailer.email}` : ''}${detailer?.phone ? ` | ${detailer.phone}` : ''}
  `.trim();

  return {
    subject: `Service Complete - ${aircraftDisplay} Detail by ${companyName}`,
    html: emailWrapper(content, { headerBg: SUCCESS_COLOR, headerText: 'Service Complete!', companyName, unsubscribeEmail: detailer?.email }),
    text,
  };
}

/**
 * FOLLOW-UP - Email to customer 7 days after quote sent (if not yet accepted)
 */
export function followUpTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, total_price, share_link, client_name, valid_until } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const amount = formatCurrency(total_price);
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const validDate = valid_until ? new Date(valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const isExpiringSoon = valid_until && (new Date(valid_until) - new Date()) < 7 * 24 * 60 * 60 * 1000;

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Just checking in! You have an outstanding quote from <strong>${companyName}</strong> for your ${aircraftDisplay} detail.
    </p>

    ${isExpiringSoon && validDate ? `
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; color: #991b1b; font-weight: 600;">
        This quote expires ${validDate}
      </p>
    </div>
    ` : ''}

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Aircraft:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Provider:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${companyName}</td>
        </tr>
        ${validDate ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Valid Until:</td>
          <td style="padding: 8px 0; text-align: right; ${isExpiringSoon ? 'color: #dc2626; font-weight: 600;' : ''}">${validDate}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; color: #6b7280;">Quote Total:</td>
          <td style="padding: 8px 0; border-top: 1px solid #e5e7eb; text-align: right; font-weight: 700; font-size: 18px; color: #1e3a5f;">${amount}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/q/${share_link}" style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Quote &amp; Pay
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Questions? Reply to this email or contact ${companyName} directly.
    </p>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Just checking in! You have an outstanding quote from ${companyName} for your ${aircraftDisplay} detail.

Aircraft: ${aircraftDisplay}
Provider: ${companyName}
${validDate ? `Valid Until: ${validDate}` : ''}
Quote Total: ${amount}

View your quote: ${APP_URL}/q/${share_link}

Questions? Reply to this email or contact ${companyName} directly.
  `.trim();

  return {
    subject: `Reminder: Your ${aircraftDisplay} Detail Quote from ${companyName}`,
    html: emailWrapper(content, { headerBg: WARNING_COLOR, headerText: 'Your Quote is Waiting', companyName, unsubscribeEmail: detailer?.email }),
    text,
  };
}

/**
 * WELCOME EMAIL - Sent to new detailers on signup
 */
export function welcomeTemplate({ detailer }) {
  const name = detailer?.name || '';
  const companyName = detailer?.company || name || 'there';

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${name ? ` ${name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Welcome to <strong>Vector</strong>! You're all set to start creating professional aircraft detailing quotes in minutes.
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 16px 0; color: #1e3a5f; font-size: 16px;">Get Started in 3 Steps:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top; width: 36px;">
            <div style="background: #1e3a5f; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">1</div>
          </td>
          <td style="padding: 10px 0;">
            <p style="margin: 0; font-weight: 600; color: #1e3a5f;">Set up your services</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Configure your pricing and service offerings in Settings.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top;">
            <div style="background: #1e3a5f; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">2</div>
          </td>
          <td style="padding: 10px 0;">
            <p style="margin: 0; font-weight: 600; color: #1e3a5f;">Connect Stripe</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Enable online payments to get paid directly through your quotes.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 12px 10px 0; vertical-align: top;">
            <div style="background: #1e3a5f; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">3</div>
          </td>
          <td style="padding: 10px 0;">
            <p style="margin: 0; font-weight: 600; color: #1e3a5f;">Create your first quote</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">Select an aircraft, choose services, and send a professional quote in under 2 minutes.</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 12px 0; color: #1e3a5f; font-size: 16px;">Your Free Plan Includes:</h3>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #374151;">
        <li style="padding: 4px 0;">3 quotes per month</li>
        <li style="padding: 4px 0;">Full aircraft database</li>
        <li style="padding: 4px 0;">Online payment collection</li>
        <li style="padding: 4px 0;">Email quote delivery</li>
      </ul>
      <p style="margin: 16px 0 0 0; font-size: 14px; color: #6b7280;">
        Need unlimited quotes? <a href="${APP_URL}/settings" style="color: #d97706; font-weight: 600;">Upgrade to Pro</a> for $79/mo.
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(to right, #f59e0b, #d97706); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Go to Dashboard
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Questions? Reply to this email and we'll help you get set up.
    </p>
  `;

  const text = `
Hi${name ? ` ${name}` : ''},

Welcome to Vector! You're all set to start creating professional aircraft detailing quotes.

Get Started in 3 Steps:

1. Set up your services - Configure your pricing in Settings.
2. Connect Stripe - Enable online payments through your quotes.
3. Create your first quote - Select an aircraft, choose services, and send in under 2 minutes.

Your Free Plan Includes:
- 3 quotes per month
- Full aircraft database
- Online payment collection
- Email quote delivery

Need unlimited quotes? Upgrade to Pro for $79/mo at ${APP_URL}/settings

Go to your dashboard: ${APP_URL}/dashboard

Questions? Reply to this email and we'll help you get set up.
  `.trim();

  return {
    subject: 'Welcome to Vector - Let\'s get your first quote out!',
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: 'Welcome to Vector!' }),
    text,
  };
}

/**
 * FEEDBACK REQUEST - Email to customer after job completed
 */
export function feedbackRequestTemplate({ quote, detailer }) {
  const { aircraft_model, aircraft_type, client_name, feedback_token } = quote;
  const aircraftDisplay = aircraft_model || aircraft_type || 'Aircraft';
  const companyName = detailer?.company || detailer?.name || 'Your Detailer';
  const feedbackUrl = `${APP_URL}/feedback/${feedback_token}`;

  const content = `
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi${client_name ? ` ${client_name}` : ''},
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Thank you for choosing <strong>${companyName}</strong> for your recent ${aircraftDisplay} detailing service. We hope everything exceeded your expectations!
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      We&rsquo;d love to hear about your experience. It only takes 30 seconds.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${feedbackUrl}" style="display: inline-block; background: linear-gradient(to right, #f59e0b, #d97706); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Rate Your Experience
      </a>
    </div>

    <div style="text-align: center; margin: 20px 0;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">How would you rate our service?</p>
      <p style="font-size: 32px; margin: 8px 0; letter-spacing: 4px;">
        <a href="${feedbackUrl}" style="text-decoration: none;">&#11088;&#11088;&#11088;&#11088;&#11088;</a>
      </p>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">
      Your feedback helps us improve and lets other aircraft owners know what to expect.
    </p>
  `;

  const text = `
Hi${client_name ? ` ${client_name}` : ''},

Thank you for choosing ${companyName} for your recent ${aircraftDisplay} detailing.

We'd love to hear about your experience. It only takes 30 seconds:
${feedbackUrl}

Your feedback helps us improve!
  `.trim();

  return {
    subject: `How was your ${aircraftDisplay} detail? - ${companyName}`,
    html: emailWrapper(content, { headerBg: BRAND_COLOR, headerText: 'Rate Your Experience', companyName, unsubscribeEmail: detailer?.email }),
    text,
  };
}

/**
 * Quote expiring soon - email to customer (24hr warning)
 */
export function quoteExpiringTemplate({ quote, detailer }) {
  const client_name = quote.client_name || quote.customer_name || 'there';
  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'your aircraft';
  const amount = formatCurrency(quote.total_price);
  const companyName = detailer?.company || detailer?.name || 'Your detailer';
  const expiryDate = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'tomorrow';
  const quoteLink = quote.share_link ? `${APP_URL}/q/${quote.share_link}` : APP_URL;

  const content = `
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 8px;">&#9200;</div>
      <h2 style="margin: 0; color: #1f2937; font-size: 22px;">Your Quote Expires Soon</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0 0;">Act now to lock in your price</p>
    </div>

    <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
      Hi ${client_name},<br><br>
      Your quote from <strong>${companyName}</strong> for <strong>${aircraftDisplay}</strong> expires on <strong style="color: #d97706;">${expiryDate}</strong>.
    </p>

    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <p style="margin: 0; font-size: 13px; color: #92400e;">Quote Total</p>
          <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 700; color: #92400e;">${amount}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 13px; color: #92400e;">Expires</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; color: #92400e;">${expiryDate}</p>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${quoteLink}" style="display: inline-block; background: #d97706; color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        View Quote Before It Expires
      </a>
    </div>

    <p style="font-size: 13px; color: #9ca3af; text-align: center;">
      After the expiration date, this quote will no longer be valid and pricing may change.
    </p>
  `;

  const text = `Hi ${client_name},\n\nYour quote from ${companyName} for ${aircraftDisplay} (${amount}) expires on ${expiryDate}.\n\nView your quote: ${quoteLink}\n\nAfter the expiration date, this quote will no longer be valid.`;

  return {
    subject: `Your quote expires tomorrow - ${amount} for ${aircraftDisplay}`,
    html: emailWrapper(content, { headerBg: WARNING_COLOR, headerText: 'Quote Expiring Soon', companyName }),
    text,
  };
}

/**
 * Quote expired - notification to detailer
 */
export function quoteExpiredDetailerTemplate({ quote, detailer }) {
  const client_name = quote.client_name || quote.customer_name || 'Customer';
  const client_email = quote.client_email || '';
  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const amount = formatCurrency(quote.total_price);
  const wasViewed = quote.status === 'viewed';

  const content = `
    <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
      Hi${detailer?.name ? ` ${detailer.name}` : ''},
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-weight: 600; color: #991b1b; font-size: 15px;">Quote Expired</p>
      <p style="margin: 4px 0 0 0; color: #991b1b; font-size: 14px;">
        ${client_name}'s quote for ${aircraftDisplay} has expired without payment.
      </p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Customer:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${client_name}</td>
      </tr>
      ${client_email ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Email:</td><td style="padding: 6px 0; text-align: right;">${client_email}</td></tr>` : ''}
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Aircraft:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Amount:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${amount}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Status before expiry:</td>
        <td style="padding: 6px 0; text-align: right;">
          <span style="background: ${wasViewed ? '#f3e8ff' : '#dbeafe'}; color: ${wasViewed ? '#7c3aed' : '#2563eb'}; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">
            ${wasViewed ? 'Viewed' : 'Not Viewed'}
          </span>
        </td>
      </tr>
    </table>

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      ${wasViewed ? 'The customer viewed the quote but didn\'t pay. Consider following up directly.' : 'The customer never opened the quote. Try resending or reaching out by phone.'}
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${APP_URL}/quotes" style="display: inline-block; background: #1e3a5f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        View in Dashboard
      </a>
    </div>
  `;

  const text = `Quote expired: ${client_name} - ${aircraftDisplay} (${amount}). Status: ${wasViewed ? 'Viewed' : 'Not Viewed'}. Consider following up.`;

  return {
    subject: `Quote expired - ${client_name} (${aircraftDisplay})`,
    html: emailWrapper(content, { headerBg: '#dc2626', headerText: 'Quote Expired' }),
    text,
  };
}

/**
 * Invoice email to customer
 */
export function invoiceTemplate({ invoice }) {
  const items = invoice.line_items || [];
  const addons = invoice.addon_fees || [];

  let itemsHtml = '';
  if (items.length > 0) {
    const rows = items.map(item => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">${item.description || item.service || 'Service'}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">${formatCurrency(item.amount || item.price || 0)}</td>
      </tr>
    `).join('');

    itemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb;">
            <th style="text-align: left; padding: 8px 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Description</th>
            <th style="text-align: right; padding: 8px 0; color: #6b7280; font-size: 12px; text-transform: uppercase;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  let addonsHtml = '';
  if (addons.length > 0) {
    addonsHtml = addons.map(a => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #6b7280; font-size: 14px;">
        <span>${a.name || 'Add-on'}</span>
        <span>${formatCurrency(a.calculated || a.amount || 0)}</span>
      </div>
    `).join('');
  }

  const feeHtml = invoice.platform_fee > 0 ? `
    <div style="padding: 4px 0; color: #9ca3af; font-size: 13px;">
      <span>Platform fee (${(invoice.platform_fee_rate * 100).toFixed(0)}%)</span>
      <span style="float: right;">${formatCurrency(invoice.platform_fee)}</span>
    </div>
  ` : '';

  const statusColor = invoice.status === 'paid' ? SUCCESS_COLOR : WARNING_COLOR;
  const statusLabel = invoice.status === 'paid' ? 'PAID' : 'UNPAID';

  const content = `
    <div style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h2 style="margin: 0 0 4px 0; color: #1f2937; font-size: 20px;">Invoice ${invoice.invoice_number}</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">${new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <span style="background: ${statusColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600;">${statusLabel}</span>
      </div>
    </div>

    <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
      <div style="margin-bottom: 12px;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">From</p>
        <p style="margin: 2px 0 0 0; font-weight: 600; color: #1f2937;">${invoice.detailer_company || invoice.detailer_name || ''}</p>
        ${invoice.detailer_email ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.detailer_email}</p>` : ''}
        ${invoice.detailer_phone ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.detailer_phone}</p>` : ''}
      </div>
      <div>
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Bill To</p>
        <p style="margin: 2px 0 0 0; font-weight: 600; color: #1f2937;">${invoice.customer_name || 'Customer'}</p>
        ${invoice.customer_company ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.customer_company}</p>` : ''}
        ${invoice.customer_email ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${invoice.customer_email}</p>` : ''}
      </div>
    </div>

    ${invoice.aircraft ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 4px 0;">Aircraft: <strong style="color: #1f2937;">${invoice.aircraft}</strong></p>` : ''}
    ${invoice.airport ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">Location: <strong style="color: #1f2937;">${invoice.airport}</strong></p>` : ''}

    ${itemsHtml}
    ${addonsHtml}

    <div style="border-top: 2px solid #1e3a5f; padding-top: 12px; margin-top: 12px;">
      ${feeHtml}
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 18px; font-weight: 700; color: #1f2937;">Total</span>
        <span style="font-size: 24px; font-weight: 700; color: #1e3a5f;">${formatCurrency(invoice.total)}</span>
      </div>
    </div>

    ${invoice.status !== 'paid' && invoice.due_date ? `
      <p style="margin: 16px 0 0 0; color: #d97706; font-size: 14px;">Due by ${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    ` : ''}

    ${invoice.notes ? `
      <div style="margin-top: 16px; padding: 12px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
        <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Notes:</strong> ${invoice.notes}</p>
      </div>
    ` : ''}
  `;

  const text = `Invoice ${invoice.invoice_number}\nFrom: ${invoice.detailer_company || invoice.detailer_name}\nTo: ${invoice.customer_name}\nTotal: ${formatCurrency(invoice.total)}\nStatus: ${statusLabel}`;

  return {
    subject: `Invoice ${invoice.invoice_number} from ${invoice.detailer_company || invoice.detailer_name || 'your detailer'}`,
    html: emailWrapper(content, {
      headerBg: BRAND_COLOR,
      headerText: `Invoice ${invoice.invoice_number}`,
      companyName: invoice.detailer_company || invoice.detailer_name || '',
    }),
    text,
  };
}
