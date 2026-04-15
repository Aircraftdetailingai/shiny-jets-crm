import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const c = { navy: '#0D1B2A', cyan: '#007CB1', white: '#fff', gray: '#666', lightGray: '#f5f5f5', border: '#e5e7eb' };

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333' },
  header: { backgroundColor: c.navy, padding: 24, marginHorizontal: -40, marginTop: -40, marginBottom: 20 },
  headerTitle: { color: c.white, fontSize: 18, fontWeight: 'bold' },
  headerSub: { color: '#8899aa', fontSize: 10, marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: c.navy, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: c.border, paddingVertical: 6 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.navy, paddingBottom: 4, marginBottom: 4 },
  cell: { fontSize: 9, color: '#333' },
  cellHeader: { fontSize: 8, fontWeight: 'bold', color: c.navy, textTransform: 'uppercase' },
  stat: { backgroundColor: c.lightGray, padding: 12, borderRadius: 4, flex: 1, textAlign: 'center' },
  statValue: { fontSize: 16, fontWeight: 'bold', color: c.navy },
  statLabel: { fontSize: 7, color: c.gray, textTransform: 'uppercase', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: '#aaa' },
});

function CleaningLogPDF({ tail, aircraft, services, stats, ownerName }) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const aircraftDisplay = [aircraft.manufacturer, aircraft.model].filter(Boolean).join(' ') || 'Aircraft';

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Aircraft Cleaning & Detailing History</Text>
          <Text style={s.headerSub}>{aircraftDisplay} {'\u00B7'} {tail}{aircraft.nickname ? ` {'\u00B7'} "${aircraft.nickname}"` : ''}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            {ownerName && <Text style={{ fontSize: 10 }}>Owner: {ownerName}</Text>}
            <Text style={{ fontSize: 9, color: c.gray }}>Report Generated: {today}</Text>
          </View>
          {aircraft.home_airport && <Text style={{ fontSize: 9, color: c.gray }}>Home Airport: {aircraft.home_airport}</Text>}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{stats.total_services}</Text>
            <Text style={s.statLabel}>Total Services</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>${stats.total_spent?.toLocaleString() || '0'}</Text>
            <Text style={s.statLabel}>Total Invested</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{stats.days_since_last_service ?? '\u2014'}</Text>
            <Text style={s.statLabel}>Days Since Service</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{services.length > 1 ? Math.round((new Date(services[0]?.created_at) - new Date(services[services.length - 1]?.created_at)) / 86400000 / Math.max(services.length - 1, 1)) : '\u2014'}</Text>
            <Text style={s.statLabel}>Avg Interval (days)</Text>
          </View>
        </View>

        {/* Service Log */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Service Log</Text>
          <View style={s.headerRow}>
            <Text style={[s.cellHeader, { width: '15%' }]}>Date</Text>
            <Text style={[s.cellHeader, { width: '25%' }]}>Service</Text>
            <Text style={[s.cellHeader, { width: '20%' }]}>Airport</Text>
            <Text style={[s.cellHeader, { width: '15%' }]}>Status</Text>
            <Text style={[s.cellHeader, { width: '12%', textAlign: 'right' }]}>Cost</Text>
          </View>
          {services.map((svc, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.cell, { width: '15%' }]}>{svc.scheduled_date || svc.created_at?.split('T')[0] || ''}</Text>
              <Text style={[s.cell, { width: '25%' }]}>{svc.aircraft || 'Service'}</Text>
              <Text style={[s.cell, { width: '20%' }]}>{svc.airport || ''}</Text>
              <Text style={[s.cell, { width: '15%' }]}>{svc.status?.replace('_', ' ') || ''}</Text>
              <Text style={[s.cell, { width: '12%', textAlign: 'right' }]}>{svc.total_price ? `$${parseFloat(svc.total_price).toLocaleString()}` : ''}</Text>
            </View>
          ))}
        </View>

        <Text style={s.footer}>Generated by Shiny Jets CRM {'\u00B7'} crm.shinyjets.com</Text>
      </Page>
    </Document>
  );
}

export async function GET(request, { params }) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { tail } = await params;
  const tailNumber = decodeURIComponent(tail).toUpperCase();
  const supabase = getSupabase();

  const { data: account } = await supabase.from('customer_accounts').select('*').eq('id', user.customer_id).single();
  if (!account) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: aircraft } = await supabase.from('customer_aircraft')
    .select('*').eq('customer_account_id', user.customer_id).eq('tail_number', tailNumber).maybeSingle();

  // Get services
  const { data: quotes } = await supabase.from('quotes')
    .select('id, aircraft_model, aircraft_type, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport')
    .ilike('customer_email', account.email).ilike('tail_number', tailNumber).order('created_at', { ascending: false });

  const { data: jobs } = await supabase.from('jobs')
    .select('id, aircraft_make, aircraft_model, tail_number, status, total_price, scheduled_date, completed_at, created_at, airport')
    .ilike('customer_email', account.email).ilike('tail_number', tailNumber).order('created_at', { ascending: false });

  const allServices = [
    ...(quotes || []).map(q => ({ ...q, aircraft: q.aircraft_model || q.aircraft_type })),
    ...(jobs || []).map(j => ({ ...j, aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const totalSpent = allServices.filter(s => ['completed', 'paid'].includes(s.status)).reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
  const lastService = allServices.find(s => s.status === 'completed');
  const daysSince = lastService?.completed_at ? Math.floor((Date.now() - new Date(lastService.completed_at).getTime()) / 86400000) : null;

  const ownerName = [account.first_name, account.last_name].filter(Boolean).join(' ') || account.name;
  const buffer = await renderToBuffer(
    <CleaningLogPDF
      tail={tailNumber}
      aircraft={aircraft || { tail_number: tailNumber }}
      services={allServices}
      stats={{ total_services: allServices.length, total_spent: totalSpent, days_since_last_service: daysSince }}
      ownerName={ownerName}
    />
  );

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${tailNumber}-cleaning-history-${dateStr}.pdf`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
