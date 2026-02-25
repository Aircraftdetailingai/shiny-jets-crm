import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const shareToken = searchParams.get('token');

  const supabase = getSupabase();

  // Auth: either detailer token or customer share link
  let quote;
  if (shareToken) {
    // Customer access via share_link
    const { data } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .eq('share_link', shareToken)
      .single();
    quote = data;
  } else {
    // Detailer access via auth token
    const user = await getAuthUser(request);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const { data } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .eq('detailer_id', user.id)
      .single();
    quote = data;
  }

  if (!quote) {
    return new Response('Quote not found', { status: 404 });
  }

  // Fetch detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('name, company, email, phone, currency')
    .eq('id', quote.detailer_id)
    .single();

  const companyName = escHtml(detailer?.company || detailer?.name || 'Detailer');
  const aircraftDisplay = escHtml(quote.aircraft_model || quote.aircraft_type || 'Aircraft');
  const isPaid = ['paid', 'approved', 'completed'].includes(quote.status);
  const isExpired = !isPaid && quote.valid_until && new Date() > new Date(quote.valid_until);

  const paidDate = quote.paid_at
    ? new Date(quote.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const createdDate = new Date(quote.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const validDate = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const clientName = escHtml(quote.client_name || quote.customer_name || '');
  const clientEmail = escHtml(quote.client_email || quote.customer_email || '');
  const clientPhone = escHtml(quote.client_phone || '');

  // Build line items
  const lineItems = Array.isArray(quote.line_items)
    ? quote.line_items.filter(li => li.description && li.amount > 0)
    : [];

  // Build services list from services object
  const serviceLabels = {
    exterior: 'Exterior Wash & Detail',
    interior: 'Interior Detail',
    brightwork: 'Brightwork Polish',
    ceramic: 'Ceramic Coating',
    engine: 'Engine Detail',
    decon: 'Decontamination',
    polish: 'Paint Correction',
    wax: 'Wax / Sealant',
    dry_wash: 'Dry Wash',
    ext_wash: 'Exterior Wash',
  };

  const servicesList = quote.services
    ? Object.entries(quote.services)
        .filter(([, v]) => v === true)
        .map(([k]) => serviceLabels[k] || k)
    : [];

  const lineItemsHtml = lineItems.map(li => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${escHtml(li.description)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px; font-weight: 500;">${fmt(li.amount)}</td>
    </tr>
  `).join('');

  // Addon fees
  const addonFees = Array.isArray(quote.addon_fees) ? quote.addon_fees.filter(f => f.name) : [];
  const addonHtml = addonFees.map(f => `
    <tr>
      <td style="padding: 8px 12px; font-size: 13px; color: #6b7280;">${escHtml(f.name)}${f.fee_type === 'percent' ? ` (${f.amount}%)` : ''}</td>
      <td style="padding: 8px 12px; text-align: right; font-size: 13px; color: #6b7280;">+${fmt(f.calculated || f.amount)}</td>
    </tr>
  `).join('');

  // Discount
  const discountPercent = quote.discount_percent || 0;

  // Status badge
  let statusBadge = '';
  if (isPaid) {
    statusBadge = '<span style="display: inline-block; background: #ecfdf5; color: #059669; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">PAID</span>';
  } else if (isExpired) {
    statusBadge = '<span style="display: inline-block; background: #fef2f2; color: #dc2626; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">EXPIRED</span>';
  } else {
    statusBadge = '<span style="display: inline-block; background: #eff6ff; color: #2563eb; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">QUOTE</span>';
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quote - ${companyName} - ${aircraftDisplay}</title>
  <style>
    @media print {
      body { padding: 20px; margin: 0; }
      .no-print { display: none !important; }
      .page { box-shadow: none !important; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 40px 20px;
      color: #1f2937;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      max-width: 750px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: white;
      padding: 36px 40px;
    }
    .content { padding: 32px 40px; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 24px;">
    <button onclick="window.print()" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; padding: 14px 40px; border-radius: 10px; font-size: 16px; cursor: pointer; font-weight: 700; letter-spacing: 0.3px; box-shadow: 0 2px 8px rgba(245,158,11,0.3);">
      Download PDF / Print
    </button>
    <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">Opens your browser's print dialog. Choose "Save as PDF" to download.</p>
  </div>

  <div class="page">
    <!-- Header -->
    <div class="header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.3px;">${companyName}</h1>
          ${detailer?.email ? `<p style="margin: 6px 0 0 0; opacity: 0.7; font-size: 13px;">${escHtml(detailer.email)}</p>` : ''}
          ${detailer?.phone ? `<p style="margin: 2px 0 0 0; opacity: 0.7; font-size: 13px;">${escHtml(detailer.phone)}</p>` : ''}
        </div>
        <div style="text-align: right;">
          ${statusBadge}
          <p style="margin: 8px 0 0 0; opacity: 0.6; font-size: 12px;">Quote #${quote.id.slice(0, 8).toUpperCase()}</p>
          <p style="margin: 2px 0 0 0; opacity: 0.6; font-size: 12px;">${createdDate}</p>
        </div>
      </div>
    </div>

    <div class="content">
      <!-- Customer + Aircraft Info -->
      <div style="display: flex; justify-content: space-between; gap: 40px; margin-bottom: 28px;">
        <div style="flex: 1;">
          <p style="margin: 0; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Prepared For</p>
          ${clientName ? `<p style="margin: 6px 0 0 0; font-weight: 700; font-size: 16px;">${clientName}</p>` : ''}
          ${clientEmail ? `<p style="margin: 2px 0 0 0; color: #6b7280; font-size: 13px;">${clientEmail}</p>` : ''}
          ${clientPhone ? `<p style="margin: 2px 0 0 0; color: #6b7280; font-size: 13px;">${clientPhone}</p>` : ''}
        </div>
        <div style="flex: 1; text-align: right;">
          <p style="margin: 0; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Aircraft Details</p>
          <p style="margin: 6px 0 0 0; font-weight: 700; font-size: 16px;">${aircraftDisplay}</p>
          ${quote.tail_number ? `<p style="margin: 2px 0 0 0; color: #6b7280; font-size: 13px;">Reg: ${escHtml(quote.tail_number)}</p>` : ''}
          ${quote.airport ? `<p style="margin: 2px 0 0 0; color: #6b7280; font-size: 13px;">Location: ${escHtml(quote.airport)}</p>` : ''}
        </div>
      </div>

      <!-- Services (if no line items) -->
      ${servicesList.length > 0 && lineItems.length === 0 ? `
      <div style="margin-bottom: 24px;">
        <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Services Included</p>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${servicesList.map(s => `<span style="background: #f0f9ff; color: #0369a1; padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500;">${escHtml(s)}</span>`).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Line Items Table -->
      ${lineItems.length > 0 ? `
      <table style="margin-bottom: 8px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 10px 12px; background: #f8fafc; border-bottom: 2px solid #1e3a5f; color: #1e3a5f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Service</th>
            <th style="text-align: right; padding: 10px 12px; background: #f8fafc; border-bottom: 2px solid #1e3a5f; color: #1e3a5f; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>
      ` : ''}

      <!-- Addon Fees -->
      ${addonHtml ? `
      <table style="margin-bottom: 8px;">
        <tbody>${addonHtml}</tbody>
      </table>
      ` : ''}

      <!-- Discount -->
      ${discountPercent > 0 ? `
      <div style="padding: 8px 12px; display: flex; justify-content: space-between; color: #059669; font-size: 13px;">
        <span>Package Discount (${discountPercent}%)</span>
        <span>Included</span>
      </div>
      ` : ''}

      <!-- Total -->
      <div style="margin-top: 16px; padding: 20px; background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: white; font-size: 16px; font-weight: 600;">Total</span>
        <span style="color: white; font-size: 28px; font-weight: 800;">${fmt(quote.total_price)}</span>
      </div>

      ${isPaid && paidDate ? `
      <p style="text-align: center; margin: 12px 0 0 0; color: #059669; font-size: 13px; font-weight: 600;">Payment received on ${paidDate}</p>
      ` : ''}

      <!-- Notes -->
      ${quote.notes ? `
      <div style="margin-top: 24px; padding: 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #92400e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Notes</p>
        <p style="margin: 6px 0 0 0; color: #78350f; font-size: 14px;">${escHtml(quote.notes)}</p>
      </div>
      ` : ''}

      <!-- Terms -->
      ${!isPaid ? `
      <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Terms</p>
        <div style="margin-top: 8px; font-size: 13px; color: #6b7280; line-height: 1.6;">
          ${validDate ? `<p style="margin: 0;">This quote is valid until <strong>${validDate}</strong>.</p>` : ''}
          <p style="margin: 4px 0 0 0;">Scheduling is subject to availability and confirmed upon payment.</p>
        </div>
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="margin-top: 32px; text-align: center; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #d1d5db; font-size: 11px;">Powered by Vector &mdash; Aircraft Detailing Software</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}
