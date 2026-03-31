import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
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

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtShortDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const c = {
  navy: '#0f172a',
  blue: '#1e3a5f',
  gold: '#007CB1',
  goldLight: '#f5ecd5',
  white: '#ffffff',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray700: '#334155',
  gray900: '#0f172a',
};

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: c.gray700 },
  header: { backgroundColor: c.blue, padding: 28, marginHorizontal: -40, marginTop: -40, marginBottom: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoText: { color: c.white, fontSize: 20, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  logoSub: { color: c.white, opacity: 0.5, fontSize: 8, marginTop: 2, letterSpacing: 2 },
  companyName: { color: c.white, fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 12 },
  companyDetail: { color: c.white, opacity: 0.7, fontSize: 9, marginTop: 2 },
  reportTitle: { color: c.white, fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  reportPeriod: { color: c.white, opacity: 0.6, fontSize: 9, textAlign: 'right', marginTop: 4 },
  // Summary box
  summaryRow: { flexDirection: 'row', marginBottom: 20, gap: 12 },
  summaryCard: { flex: 1, backgroundColor: c.gray50, borderRadius: 4, padding: 12, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: c.blue, marginBottom: 2 },
  summaryLabel: { fontSize: 7, color: c.gray500, textTransform: 'uppercase', letterSpacing: 1 },
  // Gold accent
  goldLine: { height: 2, backgroundColor: c.gold, marginBottom: 16, borderRadius: 1 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.navy, marginBottom: 8 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: c.gray50, borderBottomWidth: 2, borderBottomColor: c.blue, paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderText: { fontSize: 7, color: c.blue, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.gray200, paddingVertical: 6, paddingHorizontal: 8 },
  tableRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.gray200, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#fafbfc' },
  cell: { fontSize: 9, color: c.gray700 },
  cellBold: { fontSize: 9, color: c.gray900, fontFamily: 'Helvetica-Bold' },
  cellRight: { fontSize: 9, color: c.gray700, textAlign: 'right' },
  cellRightBold: { fontSize: 9, color: c.gray900, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  cellGold: { fontSize: 9, color: '#92740a', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  // Totals
  totalBox: { backgroundColor: c.blue, borderRadius: 6, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  totalLabel: { color: c.white, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  totalValue: { color: c.white, fontSize: 18, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: c.gray200 },
  footerText: { fontSize: 7, color: c.gray400 },
  footerGold: { fontSize: 7, color: c.gold, letterSpacing: 0.5 },
});

function ReportPDF({ type, data, detailer, startDate, endDate }) {
  const companyName = detailer?.company || detailer?.name || 'Detailer';
  const period = `${fmtDate(startDate)} — ${fmtDate(endDate)}`;
  const generatedDate = fmtShortDate(new Date().toISOString());

  const titles = {
    revenue: 'Revenue Report',
    customers: 'Customer Report',
    services: 'Services Report',
    tax: 'Tax Summary Report',
  };

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
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.reportTitle}>{titles[type] || 'Report'}</Text>
              <Text style={s.reportPeriod}>{period}</Text>
            </View>
          </View>
        </View>

        {/* Gold accent line */}
        <View style={s.goldLine} />

        {/* Report content by type */}
        {type === 'revenue' && <RevenueContent data={data} />}
        {type === 'customers' && <CustomerContent data={data} />}
        {type === 'services' && <ServicesContent data={data} />}
        {type === 'tax' && <TaxContent data={data} />}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Generated {generatedDate}</Text>
          <Text style={s.footerGold}>Powered by Shiny Jets Aviation</Text>
        </View>
      </Page>
    </Document>
  );
}

function RevenueContent({ data }) {
  const { rows, summary } = data;
  return (
    <View>
      {/* Summary cards */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.totalRevenue)}</Text>
          <Text style={s.summaryLabel}>Total Revenue</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.totalFees)}</Text>
          <Text style={s.summaryLabel}>Platform Fees</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.netRevenue)}</Text>
          <Text style={s.summaryLabel}>Net Revenue</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{summary.jobCount}</Text>
          <Text style={s.summaryLabel}>Jobs</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Transaction Details</Text>

      {/* Table */}
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderText, { width: 65 }]}>Date</Text>
        <Text style={[s.tableHeaderText, { flex: 1 }]}>Customer</Text>
        <Text style={[s.tableHeaderText, { flex: 1 }]}>Aircraft</Text>
        <Text style={[s.tableHeaderText, { width: 60, textAlign: 'right' }]}>Subtotal</Text>
        <Text style={[s.tableHeaderText, { width: 50, textAlign: 'right' }]}>Fees</Text>
        <Text style={[s.tableHeaderText, { width: 60, textAlign: 'right' }]}>Net</Text>
      </View>
      {rows.slice(0, 50).map((row, i) => (
        <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.cell, { width: 65 }]}>{fmtShortDate(row.date)}</Text>
          <Text style={[s.cellBold, { flex: 1 }]}>{row.customer || '—'}</Text>
          <Text style={[s.cell, { flex: 1 }]}>{row.aircraft || '—'}</Text>
          <Text style={[s.cellRight, { width: 60 }]}>{fmt(row.subtotal)}</Text>
          <Text style={[s.cellRight, { width: 50 }]}>{fmt(row.fees)}</Text>
          <Text style={[s.cellGold, { width: 60 }]}>{fmt(row.total)}</Text>
        </View>
      ))}

      {/* Total */}
      <View style={s.totalBox}>
        <Text style={s.totalLabel}>Net Revenue</Text>
        <Text style={s.totalValue}>{fmt(summary.netRevenue)}</Text>
      </View>
    </View>
  );
}

function CustomerContent({ data }) {
  const { rows, summary } = data;
  return (
    <View>
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{summary.totalCustomers}</Text>
          <Text style={s.summaryLabel}>Total Customers</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{summary.activeCustomers}</Text>
          <Text style={s.summaryLabel}>Active</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{summary.atRiskCustomers}</Text>
          <Text style={s.summaryLabel}>At Risk</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.avgLifetimeValue)}</Text>
          <Text style={s.summaryLabel}>Avg Lifetime Value</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Customer Details</Text>

      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderText, { flex: 1.5 }]}>Customer</Text>
        <Text style={[s.tableHeaderText, { width: 70, textAlign: 'right' }]}>Lifetime</Text>
        <Text style={[s.tableHeaderText, { width: 45, textAlign: 'right' }]}>Quotes</Text>
        <Text style={[s.tableHeaderText, { width: 70 }]}>Last Service</Text>
        <Text style={[s.tableHeaderText, { width: 50 }]}>Status</Text>
      </View>
      {rows.slice(0, 50).map((row, i) => (
        <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.cellBold, { flex: 1.5 }]}>{row.name}</Text>
          <Text style={[s.cellGold, { width: 70 }]}>{fmt(row.totalValue)}</Text>
          <Text style={[s.cellRight, { width: 45 }]}>{row.quoteCount}</Text>
          <Text style={[s.cell, { width: 70 }]}>{row.lastServiceDate ? fmtShortDate(row.lastServiceDate) : '—'}</Text>
          <Text style={[s.cell, { width: 50 }]}>{row.retention}</Text>
        </View>
      ))}
    </View>
  );
}

function ServicesContent({ data }) {
  const { rows, summary } = data;
  return (
    <View>
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{summary.totalServices}</Text>
          <Text style={s.summaryLabel}>Service Types</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{summary.totalBookings}</Text>
          <Text style={s.summaryLabel}>Total Bookings</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryValue, { fontSize: 11 }]}>{summary.topService}</Text>
          <Text style={s.summaryLabel}>Top Service</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Service Breakdown</Text>

      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderText, { flex: 2 }]}>Service</Text>
        <Text style={[s.tableHeaderText, { width: 55, textAlign: 'right' }]}>Booked</Text>
        <Text style={[s.tableHeaderText, { width: 55, textAlign: 'right' }]}>Hours</Text>
        <Text style={[s.tableHeaderText, { width: 70, textAlign: 'right' }]}>Revenue</Text>
        <Text style={[s.tableHeaderText, { width: 65, textAlign: 'right' }]}>Avg Ticket</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.cellBold, { flex: 2 }]}>{row.name}</Text>
          <Text style={[s.cellRight, { width: 55 }]}>{row.timesBooked}</Text>
          <Text style={[s.cellRight, { width: 55 }]}>{row.totalHours > 0 ? row.totalHours.toFixed(1) : '—'}</Text>
          <Text style={[s.cellGold, { width: 70 }]}>{fmt(row.totalRevenue)}</Text>
          <Text style={[s.cellRight, { width: 65 }]}>{fmt(row.avgTicket)}</Text>
        </View>
      ))}
    </View>
  );
}

function TaxContent({ data }) {
  const { rows, summary } = data;
  return (
    <View>
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.totalRevenue)}</Text>
          <Text style={s.summaryLabel}>Gross Revenue</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.totalFees)}</Text>
          <Text style={s.summaryLabel}>Platform Fees Paid</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryValue}>{fmt(summary.netRevenue)}</Text>
          <Text style={s.summaryLabel}>Net Revenue</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Monthly Breakdown</Text>

      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderText, { flex: 1 }]}>Month</Text>
        <Text style={[s.tableHeaderText, { width: 45, textAlign: 'right' }]}>Jobs</Text>
        <Text style={[s.tableHeaderText, { width: 80, textAlign: 'right' }]}>Revenue</Text>
        <Text style={[s.tableHeaderText, { width: 70, textAlign: 'right' }]}>Fees</Text>
        <Text style={[s.tableHeaderText, { width: 80, textAlign: 'right' }]}>Net</Text>
      </View>
      {rows.map((row, i) => {
        const [y, m] = row.month.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const label = `${months[parseInt(m) - 1]} ${y}`;
        return (
          <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <Text style={[s.cellBold, { flex: 1 }]}>{label}</Text>
            <Text style={[s.cellRight, { width: 45 }]}>{row.jobCount}</Text>
            <Text style={[s.cellRight, { width: 80 }]}>{fmt(row.revenue)}</Text>
            <Text style={[s.cellRight, { width: 70 }]}>{fmt(row.fees)}</Text>
            <Text style={[s.cellGold, { width: 80 }]}>{fmt(row.net)}</Text>
          </View>
        );
      })}

      <View style={s.totalBox}>
        <Text style={s.totalLabel}>Net Revenue (Tax Year)</Text>
        <Text style={s.totalValue}>{fmt(summary.netRevenue)}</Text>
      </View>
    </View>
  );
}

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'revenue';
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    const supabase = getSupabase();

    // Fetch report data via internal logic (same as main reports route)
    const reportRes = await fetch(new URL(`/api/reports?type=${type}&start=${startDate || ''}&end=${endDate || ''}`, request.url), {
      headers: { Authorization: request.headers.get('authorization') || '' },
    });

    if (!reportRes.ok) return new Response('Failed to fetch report data', { status: 500 });
    const reportData = await reportRes.json();

    // Fetch detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('name, company, email, phone')
      .eq('id', user.id)
      .single();

    const data = reportData[type];
    if (!data) return new Response('No data for this report type', { status: 400 });

    const buffer = await renderToBuffer(
      <ReportPDF
        type={type}
        data={data}
        detailer={detailer}
        startDate={startDate}
        endDate={endDate}
      />
    );

    const typeLabels = { revenue: 'Revenue', customers: 'Customer', services: 'Services', tax: 'Tax-Summary' };
    const filename = `ShinyjetsReport-${typeLabels[type] || 'Report'}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Report PDF error:', err);
    return new Response('Failed to generate PDF', { status: 500 });
  }
}
