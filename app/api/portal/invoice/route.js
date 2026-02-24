import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

// GET - Generate printable invoice/receipt HTML
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get('id');
  const token = searchParams.get('token');

  if (!quoteId || !token) {
    return new Response('Missing parameters', { status: 400 });
  }

  const supabase = getSupabase();

  // Verify the token matches a quote from this customer
  const { data: tokenQuote } = await supabase
    .from('quotes')
    .select('customer_email, client_email')
    .eq('share_link', token)
    .single();

  if (!tokenQuote) {
    return new Response('Unauthorized', { status: 401 });
  }

  const email = tokenQuote.customer_email || tokenQuote.client_email;

  // Fetch the quote for the invoice
  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single();

  if (!quote) {
    return new Response('Quote not found', { status: 404 });
  }

  // Verify customer email matches
  const quoteEmail = quote.customer_email || quote.client_email;
  if (quoteEmail?.toLowerCase() !== email?.toLowerCase()) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Fetch detailer
  const { data: detailer } = await supabase
    .from('detailers')
    .select('name, company, email, phone')
    .eq('id', quote.detailer_id)
    .single();

  const companyName = detailer?.company || detailer?.name || 'Detailer';
  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const isPaid = ['paid', 'approved', 'completed'].includes(quote.status);
  const paidDate = quote.paid_at ? new Date(quote.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const createdDate = new Date(quote.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build line items
  const lineItems = Array.isArray(quote.line_items)
    ? quote.line_items.filter(li => li.description && li.amount > 0)
    : [];

  const lineItemsHtml = lineItems.map(li => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${li.description}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(li.amount)}</td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isPaid ? 'Receipt' : 'Invoice'} - ${companyName}</title>
  <style>
    @media print {
      body { padding: 0; margin: 0; }
      .no-print { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 700px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 30px;">
    <button onclick="window.print()" style="background: #1e3a5f; color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 600;">
      Print / Save as PDF
    </button>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
    <div>
      <h1 style="margin: 0; color: #1e3a5f; font-size: 28px;">${isPaid ? 'Receipt' : 'Invoice'}</h1>
      <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">
        ${isPaid ? `Paid on ${paidDate}` : `Issued on ${createdDate}`}
      </p>
    </div>
    <div style="text-align: right;">
      <p style="margin: 0; font-weight: 700; font-size: 18px; color: #1e3a5f;">${companyName}</p>
      ${detailer?.email ? `<p style="margin: 2px 0; color: #6b7280; font-size: 13px;">${detailer.email}</p>` : ''}
      ${detailer?.phone ? `<p style="margin: 2px 0; color: #6b7280; font-size: 13px;">${detailer.phone}</p>` : ''}
    </div>
  </div>

  <div style="display: flex; justify-content: space-between; margin-bottom: 30px; gap: 40px;">
    <div>
      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Bill To</p>
      <p style="margin: 4px 0 0 0; font-weight: 600;">${quote.client_name || quote.customer_name || ''}</p>
      ${quoteEmail ? `<p style="margin: 2px 0; color: #6b7280; font-size: 13px;">${quoteEmail}</p>` : ''}
    </div>
    <div style="text-align: right;">
      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Quote #</p>
      <p style="margin: 4px 0 0 0; font-weight: 600; font-size: 13px;">${quote.id.slice(0, 8).toUpperCase()}</p>
    </div>
  </div>

  <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 30px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 6px 0; color: #6b7280;">Aircraft:</td>
        <td style="padding: 6px 0; text-align: right; font-weight: 600;">${aircraftDisplay}</td>
      </tr>
      ${quote.tail_number ? `
      <tr>
        <td style="padding: 6px 0; color: #6b7280;">Registration:</td>
        <td style="padding: 6px 0; text-align: right;">${quote.tail_number}</td>
      </tr>` : ''}
      ${quote.airport ? `
      <tr>
        <td style="padding: 6px 0; color: #6b7280;">Location:</td>
        <td style="padding: 6px 0; text-align: right;">${quote.airport}</td>
      </tr>` : ''}
    </table>
  </div>

  ${lineItems.length > 0 ? `
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <thead>
      <tr>
        <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #1e3a5f; color: #1e3a5f;">Service</th>
        <th style="text-align: right; padding: 8px 0; border-bottom: 2px solid #1e3a5f; color: #1e3a5f;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>
  ` : ''}

  <div style="text-align: right; margin-top: 20px; padding-top: 16px; border-top: 2px solid #1e3a5f;">
    <p style="margin: 0; font-size: 14px; color: #6b7280;">Total</p>
    <p style="margin: 4px 0 0 0; font-size: 32px; font-weight: 700; color: #1e3a5f;">${formatCurrency(quote.total_price)}</p>
    ${isPaid ? `<p style="margin: 8px 0 0 0; display: inline-block; background: #ecfdf5; color: #059669; padding: 4px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">PAID</p>` : ''}
  </div>

  ${quote.notes ? `
  <div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Notes</p>
    <p style="margin: 4px 0 0 0; color: #374151;">${quote.notes}</p>
  </div>
  ` : ''}

  <div style="margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p>Powered by Vector - Aircraft Detailing Software</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}
