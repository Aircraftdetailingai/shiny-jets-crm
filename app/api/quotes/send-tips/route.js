import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const supabase = getSupabase();

  try {
    const { quoteId, shareLink } = await request.json();

    if (!quoteId) {
      return new Response(JSON.stringify({ error: 'Quote ID required' }), { status: 400 });
    }

    // Authenticate via either user session (detailer) or shareLink (customer)
    const user = await getAuthUser(request);
    let query = supabase
      .from('quotes')
      .select('id, client_email, client_name, detailer_id, tips_sent_at')
      .eq('id', quoteId);

    if (user) {
      // Detailer: must own the quote
      query = query.eq('detailer_id', user.id);
    } else if (shareLink) {
      // Customer: must provide valid share_link
      query = query.eq('share_link', shareLink);
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { data: quote, error: quoteError } = await query.single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
    }

    // Fetch detailer
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name')
      .eq('id', quote.detailer_id)
      .single();

    // Send tips email to customer
    if (quote.client_email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Vector <noreply@vectorav.ai>',
            to: quote.client_email,
            subject: 'Preparing for Your Aircraft Detail',
            html: `
              <h2>Thank you for booking with ${detailer?.company || 'us'}!</h2>

              <p>Here are some tips to help prepare for your upcoming aircraft detail:</p>

              <h3>Before the Detail:</h3>
              <ul>
                <li><strong>Remove personal items</strong> - Clear out any loose items from the cabin, including papers, headsets, and personal belongings.</li>
                <li><strong>Empty trash</strong> - Dispose of any garbage or debris.</li>
                <li><strong>Note problem areas</strong> - If there are specific stains, scuffs, or areas needing extra attention, make a note to share with your detailing team.</li>
                <li><strong>Ensure access</strong> - Make sure the hangar or location is accessible and the aircraft will be available for the scheduled time.</li>
              </ul>

              <h3>What to Expect:</h3>
              <ul>
                <li>A thorough exterior wash and detail including all surfaces</li>
                <li>Interior cleaning and conditioning</li>
                <li>Professional-grade products safe for aircraft surfaces</li>
                <li>Attention to detail on brightwork and chrome</li>
              </ul>

              <h3>After the Detail:</h3>
              <ul>
                <li>Avoid touching freshly detailed surfaces for a few hours</li>
                <li>Keep windows closed for 24 hours if ceramic coating was applied</li>
                <li>Regular maintenance details will keep your aircraft looking its best</li>
              </ul>

              <p>If you have any questions, feel free to reach out to ${detailer?.company || 'your detailing professional'}.</p>

              <p>Looking forward to making your aircraft shine!</p>

              <p><em>- ${detailer?.company || detailer?.name || 'Your Detailing Team'}</em></p>
            `
          })
        });
      } catch (e) {
        console.error('Failed to send tips email:', e);
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
      }
    } else {
      return new Response(JSON.stringify({ error: 'No email on file for this quote' }), { status: 400 });
    }

    // Mark that tips were sent
    await supabase
      .from('quotes')
      .update({ tips_sent_at: new Date().toISOString() })
      .eq('id', quoteId);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Send tips error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send tips' }), { status: 500 });
  }
}
