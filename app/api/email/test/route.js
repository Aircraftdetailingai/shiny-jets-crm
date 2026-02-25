import { getAuthUser } from '@/lib/auth';
import {
  sendQuoteSentEmail,
  sendQuoteViewedEmail,
  sendPaymentReceivedEmail,
  sendPaymentConfirmedEmail,
} from '@/lib/email';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
];

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'all';
  const email = searchParams.get('email');

  if (!email) {
    return Response.json({
      error: 'Email parameter required',
      usage: '/api/email/test?email=test@example.com&type=quote_sent',
      types: ['quote_sent', 'quote_viewed', 'payment_received', 'payment_confirmed', 'all'],
    }, { status: 400 });
  }

  // Use mock data instead of reading real records from the database
  const testQuote = {
    id: 'test-quote-id',
    client_email: email,
    client_name: 'Test Customer',
    aircraft_type: 'Light Jet',
    aircraft_model: 'Citation CJ3',
    total_price: 1500,
    share_link: 'test-link',
    services: [{ name: 'Exterior Wash', price: 800 }, { name: 'Interior Detail', price: 700 }],
    status: 'sent',
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString(),
  };

  const testDetailer = {
    id: 'test-detailer-id',
    email: email,
    name: 'Test Detailer',
    company: 'Test Aviation Detailing',
    phone: '(555) 000-0000',
  };

  const results = {};

  try {
    if (type === 'quote_sent' || type === 'all') {
      results.quote_sent = await sendQuoteSentEmail({
        quote: testQuote,
        detailer: testDetailer,
      });
    }

    if (type === 'quote_viewed' || type === 'all') {
      results.quote_viewed = await sendQuoteViewedEmail({
        quote: testQuote,
        detailer: testDetailer,
        viewedAt: new Date().toISOString(),
      });
    }

    if (type === 'payment_received' || type === 'all') {
      results.payment_received = await sendPaymentReceivedEmail({
        quote: testQuote,
        detailer: testDetailer,
      });
    }

    if (type === 'payment_confirmed' || type === 'all') {
      results.payment_confirmed = await sendPaymentConfirmedEmail({
        quote: testQuote,
        detailer: testDetailer,
      });
    }

    return Response.json({
      success: true,
      sentTo: email,
      type,
      results,
    });

  } catch (err) {
    return Response.json({
      error: err.message,
      results,
    }, { status: 500 });
  }
}
