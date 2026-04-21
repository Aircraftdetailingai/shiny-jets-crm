import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { calculateCcFee } from '@/lib/cc-fee';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

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

const colors = {
  navy: '#0f172a',
  blue: '#1e3a5f',
  amber: '#f59e0b',
  white: '#ffffff',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray700: '#334155',
  gray900: '#0f172a',
  green: '#059669',
  red: '#dc2626',
};

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: colors.gray700 },
  // Header
  header: { backgroundColor: colors.blue, padding: 28, marginHorizontal: -40, marginTop: -40, marginBottom: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoText: { color: colors.white, fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  logoSub: { color: colors.white, opacity: 0.5, fontSize: 8, marginTop: 2, letterSpacing: 2 },
  companyName: { color: colors.white, fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 12 },
  companyDetail: { color: colors.white, opacity: 0.7, fontSize: 9, marginTop: 2 },
  quoteNumLarge: { color: colors.white, fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  quoteDate: { color: colors.white, opacity: 0.6, fontSize: 9, textAlign: 'right', marginTop: 3 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-end', marginBottom: 6 },
  statusText: { fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  // Info columns
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 8, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  infoValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: colors.gray900, marginBottom: 1 },
  infoSub: { fontSize: 9, color: colors.gray500, marginTop: 1 },
  // Date row
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.gray50, borderRadius: 4 },
  dateLabel: { fontSize: 8, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Helvetica-Bold' },
  dateValue: { fontSize: 10, color: colors.gray900, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: colors.gray50, borderBottomWidth: 2, borderBottomColor: colors.blue, paddingVertical: 8, paddingHorizontal: 12 },
  tableHeaderText: { fontSize: 8, color: colors.blue, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.gray200, paddingVertical: 9, paddingHorizontal: 12 },
  tableCell: { fontSize: 10, color: colors.gray700 },
  tableCellRight: { fontSize: 10, color: colors.gray700, textAlign: 'right' },
  tableCellBold: { fontSize: 10, color: colors.gray900, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  // Subtotal
  subtotalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.gray200 },
  subtotalLabel: { fontSize: 10, color: colors.gray500, marginRight: 20 },
  subtotalValue: { fontSize: 10, color: colors.gray900, fontFamily: 'Helvetica-Bold', width: 80, textAlign: 'right' },
  // Fees
  feeRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingVertical: 3 },
  feeLabel: { fontSize: 9, color: colors.gray500, marginRight: 20 },
  feeValue: { fontSize: 9, color: colors.gray500, width: 80, textAlign: 'right' },
  discountLabel: { fontSize: 9, color: colors.green },
  // Total
  totalBox: { backgroundColor: colors.blue, borderRadius: 6, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  totalLabel: { color: colors.white, fontSize: 14, fontFamily: 'Helvetica-Bold' },
  totalValue: { color: colors.white, fontSize: 24, fontFamily: 'Helvetica-Bold' },
  // Notes
  notesBox: { marginTop: 20, padding: 14, backgroundColor: '#fffbeb', borderLeftWidth: 3, borderLeftColor: colors.amber, borderRadius: 4 },
  notesLabel: { fontSize: 8, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  notesText: { fontSize: 9, color: '#78350f', lineHeight: 1.5 },
  // Terms
  termsBox: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.gray200 },
  termsLabel: { fontSize: 8, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  termsText: { fontSize: 8, color: colors.gray500, lineHeight: 1.5 },
  // Footer
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.gray200 },
  footerText: { fontSize: 7, color: colors.gray400, letterSpacing: 0.5 },
  // Paid stamp
  paidText: { fontSize: 9, color: colors.green, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 10 },
});

function QuotePDF({ quote, detailer, lineItems, servicesList, addonFees, packageName, packageServices }) {
  const companyName = detailer?.company || detailer?.name || 'Detailer';
  const aircraftDisplay = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const isPaid = ['paid', 'approved', 'completed'].includes(quote.status);
  const isExpired = !isPaid && quote.valid_until && new Date() > new Date(quote.valid_until);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const createdDate = fmtDate(quote.created_at);
  const validDate = fmtDate(quote.valid_until);
  const paidDate = fmtDate(quote.paid_at);

  const clientName = quote.client_name || quote.customer_name || '';
  const clientEmail = quote.client_email || quote.customer_email || '';
  const clientPhone = quote.client_phone || '';

  // Fee calculations
  const basePrice = parseFloat(quote.total_price) || 0;
  const plan = detailer?.plan || 'free';
  const PLATFORM_FEES = { free: 0.05, pro: 0.02, business: 0.01, enterprise: 0.00 };
  const feeRate = PLATFORM_FEES[plan] || PLATFORM_FEES.free;
  const passFee = detailer?.pass_fee_to_customer;
  const serviceFee = passFee ? Math.round(basePrice * feeRate * 100) / 100 : 0;
  const subtotalWithService = basePrice + serviceFee;

  const ccFeeMode = detailer?.cc_fee_mode || 'absorb';
  const ccFee = ccFeeMode === 'pass' ? calculateCcFee(subtotalWithService) : 0;
  const displayTotal = subtotalWithService + ccFee;

  const discountPercent = quote.discount_percent || 0;
  const displayPref = detailer?.quote_display_preference || 'package';
  const showFullBreakdown = displayPref === 'full_breakdown' && !quote.minimum_fee_applied;
  const showLaborProducts = displayPref === 'labor_products' && !quote.minimum_fee_applied;

  // Check if line items have hours/rate data
  const hasHoursData = lineItems.some(li => li.hours > 0 && li.rate > 0);

  // Subtotal from line items
  const lineItemsSubtotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0);
  const addonTotal = addonFees.reduce((sum, f) => sum + (parseFloat(f.calculated || f.amount) || 0), 0);

  // Terms snippet
  const termsSnippet = detailer?.terms_text
    ? (detailer.terms_text.length > 200 ? detailer.terms_text.slice(0, 200) + '...' : detailer.terms_text)
    : '';

  // Status
  let statusLabel = 'QUOTE';
  let statusBg = '#eff6ff';
  let statusColor = '#2563eb';
  if (isPaid) { statusLabel = 'PAID'; statusBg = '#ecfdf5'; statusColor = colors.green; }
  else if (isExpired) { statusLabel = 'EXPIRED'; statusBg = '#fef2f2'; statusColor = colors.red; }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.logoText}>Shiny Jets</Text>
              <Text style={s.logoSub}>AIRCRAFT DETAILING</Text>
              <Text style={s.companyName}>{companyName}</Text>
              {detailer?.email && <Text style={s.companyDetail}>{detailer.email}</Text>}
              {detailer?.phone && <Text style={s.companyDetail}>{detailer.phone}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
                <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              <Text style={s.quoteNumLarge}>Quote #{quote.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={s.quoteDate}>{createdDate}</Text>
            </View>
          </View>
        </View>

        {/* Customer + Aircraft info */}
        <View style={s.infoRow}>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Prepared For</Text>
            {clientName ? <Text style={s.infoValue}>{clientName}</Text> : null}
            {clientEmail ? <Text style={s.infoSub}>{clientEmail}</Text> : null}
            {clientPhone ? <Text style={s.infoSub}>{clientPhone}</Text> : null}
            {!clientName && !clientEmail && <Text style={s.infoSub}>Customer</Text>}
          </View>
          <View style={[s.infoCol, { alignItems: 'flex-end' }]}>
            <Text style={s.infoLabel}>Aircraft</Text>
            <Text style={s.infoValue}>{aircraftDisplay}</Text>
            {quote.tail_number && <Text style={s.infoSub}>Tail: {quote.tail_number}</Text>}
            {quote.airport && <Text style={s.infoSub}>Location: {quote.airport}</Text>}
          </View>
        </View>

        {/* Quote date + expiry row */}
        <View style={s.dateRow}>
          <View>
            <Text style={s.dateLabel}>Quote Date</Text>
            <Text style={s.dateValue}>{createdDate}</Text>
          </View>
          {validDate && !isPaid && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.dateLabel}>Valid Until</Text>
              <Text style={[s.dateValue, isExpired ? { color: colors.red } : {}]}>{validDate}</Text>
            </View>
          )}
          {isPaid && paidDate && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.dateLabel}>Paid On</Text>
              <Text style={[s.dateValue, { color: colors.green }]}>{paidDate}</Text>
            </View>
          )}
        </View>

        {/* Services chips (when no line items) */}
        {servicesList.length > 0 && lineItems.length === 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {servicesList.map((svc, i) => (
              <View key={i} style={{ backgroundColor: '#f0f9ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}>
                <Text style={{ fontSize: 9, color: '#0369a1', fontFamily: 'Helvetica-Bold' }}>{svc}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ─── PACKAGE DISPLAY ─── */}
        {packageName && lineItems.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { flex: 3 }]}>Service</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>
            {/* Package as single line item */}
            <View style={s.tableRow}>
              <View style={{ flex: 3 }}>
                <Text style={[s.tableCell, { fontFamily: 'Helvetica-Bold' }]}>{packageName}</Text>
                {packageServices.length > 0 && (
                  <Text style={{ fontSize: 8, color: colors.gray400, marginTop: 2 }}>
                    Includes: {packageServices.join(', ')}
                  </Text>
                )}
              </View>
              <Text style={[s.tableCellBold, { flex: 1 }]}>{fmt(basePrice)}</Text>
            </View>
            <View style={s.subtotalRow}>
              <Text style={s.subtotalLabel}>Subtotal</Text>
              <Text style={s.subtotalValue}>{fmt(basePrice)}</Text>
            </View>
          </View>
        )}

        {/* ─── INDIVIDUAL SERVICES — Full breakdown with hours/rate ─── */}
        {!packageName && lineItems.length > 0 && showFullBreakdown && hasHoursData && (
          <View style={{ marginBottom: 4 }}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { flex: 3 }]}>Service</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Hours</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Rate</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Total</Text>
            </View>
            {lineItems.map((li, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={[s.tableCell, { flex: 3 }]}>{li.description || li.service || li.name || 'Service'}</Text>
                <Text style={[s.tableCellRight, { flex: 1 }]}>{(parseFloat(li.hours) || 0).toFixed(1)}</Text>
                <Text style={[s.tableCellRight, { flex: 1 }]}>{fmt(li.rate)}/hr</Text>
                <Text style={[s.tableCellBold, { flex: 1 }]}>{fmt(li.amount)}</Text>
              </View>
            ))}
            <View style={s.subtotalRow}>
              <Text style={s.subtotalLabel}>Subtotal</Text>
              <Text style={s.subtotalValue}>{fmt(lineItemsSubtotal)}</Text>
            </View>
          </View>
        )}

        {/* ─── INDIVIDUAL SERVICES — Simple (no hours/rate) ─── */}
        {!packageName && lineItems.length > 0 && (!showFullBreakdown || !hasHoursData) && !showLaborProducts && (
          <View style={{ marginBottom: 4 }}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { flex: 3 }]}>Service</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>
            {lineItems.map((li, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={[s.tableCell, { flex: 3 }]}>{li.description || li.service || li.name || 'Service'}</Text>
                <Text style={[s.tableCellBold, { flex: 1 }]}>{fmt(li.amount)}</Text>
              </View>
            ))}
            <View style={s.subtotalRow}>
              <Text style={s.subtotalLabel}>Subtotal</Text>
              <Text style={s.subtotalValue}>{fmt(lineItemsSubtotal)}</Text>
            </View>
          </View>
        )}

        {/* Labor/Products split */}
        {!packageName && showLaborProducts && (
          <View style={{ marginBottom: 4 }}>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { flex: 3 }]}>Description</Text>
              <Text style={[s.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>
            <View style={s.tableRow}>
              <Text style={[s.tableCell, { flex: 3 }]}>Labor</Text>
              <Text style={[s.tableCellBold, { flex: 1 }]}>{fmt(parseFloat(quote.labor_total) || basePrice * 0.7)}</Text>
            </View>
            <View style={s.tableRow}>
              <Text style={[s.tableCell, { flex: 3 }]}>Products & Materials</Text>
              <Text style={[s.tableCellBold, { flex: 1 }]}>{fmt(parseFloat(quote.products_total) || basePrice * 0.3)}</Text>
            </View>
            <View style={s.subtotalRow}>
              <Text style={s.subtotalLabel}>Subtotal</Text>
              <Text style={s.subtotalValue}>{fmt(basePrice)}</Text>
            </View>
          </View>
        )}

        {/* ─── PROPOSED SCHEDULE (business days) ─── */}
        {(() => {
          const totalHrs = parseFloat(quote.total_hours) || 0;
          const dailyCap = 8; // TODO: wire from detailer settings (hours_per_day * staff_count)
          const bizDays = totalHrs > 0 ? Math.max(1, Math.ceil(totalHrs / dailyCap)) : 0;
          const startRaw = quote.proposed_date || quote.scheduled_date;
          let start = startRaw ? new Date(startRaw) : null;
          if (start) {
            if (start.getDay() === 0) start.setDate(start.getDate() + 1);
            if (start.getDay() === 6) start.setDate(start.getDate() + 2);
          }
          const finish = start && bizDays > 0 ? (() => {
            const f = new Date(start);
            let rem = bizDays - 1;
            while (rem > 0) { f.setDate(f.getDate() + 1); if (f.getDay() !== 0 && f.getDay() !== 6) rem--; }
            return f;
          })() : null;
          const fmtShort = (d) => d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
          return (
            <View style={{ marginTop: 8, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.gray50, borderRadius: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={s.dateLabel}>Start Date</Text>
                <Text style={s.dateValue}>{start ? fmtShort(start) : 'To be scheduled'}</Text>
              </View>
              {finish && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.dateLabel}>Finish Date</Text>
                  <Text style={s.dateValue}>{fmtShort(finish)}</Text>
                </View>
              )}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.dateLabel}>Duration</Text>
                <Text style={s.dateValue}>{bizDays > 0 ? `${bizDays} Business Day${bizDays !== 1 ? 's' : ''}` : 'TBD'}</Text>
              </View>
            </View>
          );
        })()}

        {/* Addon Fees */}
        {addonFees.length > 0 && !quote.minimum_fee_applied && (
          <View style={{ marginTop: 2 }}>
            {addonFees.map((f, i) => (
              <View key={i} style={s.feeRow}>
                <Text style={s.feeLabel}>{f.name}{f.fee_type === 'percent' ? ` (${f.amount}%)` : ''}</Text>
                <Text style={[s.feeValue]}>+{fmt(f.calculated || f.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Discount */}
        {discountPercent > 0 && !quote.minimum_fee_applied && (
          <View style={s.feeRow}>
            <Text style={s.discountLabel}>Package Discount ({discountPercent}%)</Text>
            <Text style={[s.discountLabel, { width: 80, textAlign: 'right' }]}>Included</Text>
          </View>
        )}

        {/* Service fee included in total — not shown to customer */}

        {/* CC Fee */}
        {ccFee > 0 && (
          <View style={s.feeRow}>
            <Text style={s.feeLabel}>Processing Fee (2.9% + $0.30)</Text>
            <Text style={s.feeValue}>+{fmt(ccFee)}</Text>
          </View>
        )}

        {/* Total */}
        <View style={s.totalBox}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalValue}>{fmt(displayTotal)}</Text>
        </View>

        {isPaid && paidDate && <Text style={s.paidText}>Payment received on {paidDate}</Text>}

        {/* Notes */}
        {quote.notes && (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Notes</Text>
            <Text style={s.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* Terms */}
        {(!isPaid && termsSnippet) && (
          <View style={s.termsBox}>
            <Text style={s.termsLabel}>Terms & Conditions</Text>
            <Text style={s.termsText}>Scheduling is subject to availability and confirmed upon payment.</Text>
            {termsSnippet ? <Text style={[s.termsText, { marginTop: 6 }]}>{termsSnippet}</Text> : null}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Powered by Shiny Jets Aviation</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  // Accept both param names. `shareToken` is what SendQuoteModal sends;
  // `token` is the legacy name some customer-facing links may still use.
  const shareToken = searchParams.get('shareToken') || searchParams.get('token');

  const supabase = getSupabase();

  let quote;
  if (shareToken) {
    const { data } = await supabase.from('quotes').select('*').eq('id', id).eq('share_link', shareToken).single();
    quote = data;
  }
  // Auth fallback: an authenticated owner can always fetch their own quote's
  // PDF, even if the share_link is absent or stale (e.g. right after save,
  // before replica catch-up, or when opening from the CRM rather than a link).
  if (!quote) {
    const user = await getAuthUser(request);
    if (user) {
      const { data } = await supabase.from('quotes').select('*').eq('id', id).eq('detailer_id', user.id).single();
      quote = data;
    } else if (!shareToken) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  if (!quote) return new Response('Quote not found', { status: 404 });

  // Fetch detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('name, company, email, phone, preferred_currency, plan, pass_fee_to_customer, cc_fee_mode, terms_text, quote_display_preference')
    .eq('id', quote.detailer_id)
    .single();

  // Build line items
  const rawItems = quote.line_items || quote.metadata?.line_items || [];
  const lineItems = Array.isArray(rawItems) ? rawItems.filter(li => (li.description || li.service || li.name) && li.amount > 0) : [];

  // Build services list
  const serviceLabels = {
    exterior: 'Exterior Wash & Detail', interior: 'Interior Detail',
    brightwork: 'Brightwork Polish', ceramic: 'Ceramic Coating',
    engine: 'Engine Detail', decon: 'Decontamination',
    polish: 'Paint Correction', wax: 'Wax / Sealant',
    dry_wash: 'Dry Wash', ext_wash: 'Exterior Wash',
  };
  const servicesList = quote.services
    ? Object.entries(quote.services).filter(([, v]) => v === true).map(([k]) => serviceLabels[k] || k)
    : [];

  // Addon fees
  const addonFees = Array.isArray(quote.addon_fees) ? quote.addon_fees.filter(f => f.name) : [];

  // Package info
  const packageName = quote.selected_package_name || null;
  const packageServices = packageName
    ? lineItems.map(li => li.description || li.service || li.name).filter(Boolean)
    : [];

  const buffer = await renderToBuffer(
    <QuotePDF
      quote={quote}
      detailer={detailer}
      lineItems={lineItems}
      servicesList={servicesList}
      addonFees={addonFees}
      packageName={packageName}
      packageServices={packageServices}
    />
  );

  const filename = `Quote-${(quote.aircraft_model || quote.aircraft_type || 'Aircraft').replace(/[^a-zA-Z0-9]/g, '-')}-${quote.id.slice(0, 8).toUpperCase()}.pdf`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
