// Public: branding + availability for the AI chat bubble on a detailer's site.
import { getServiceSupabase, loadChatAccount, chatSettingsOf, chatEligible, appBaseUrl } from '@/lib/ai-chat-server';
import { brandColors, HOLD_HARMLESS_NOTE, SMS_CONSENT_TEXT } from '@/lib/ai-chat';
import { publicRequestUrl } from '@/lib/share-snippets';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Public, non-sensitive branding info: readable from any website so the
// bubble script can decide whether to show itself.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'no-store' };
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(request) {
  const account = new URL(request.url).searchParams.get('account');
  const supabase = getServiceSupabase();
  const detailer = await loadChatAccount(supabase, account);
  if (!detailer) return Response.json({ available: false, reason: 'not_found' }, { status: 404, headers: CORS });
  const settings = chatSettingsOf(detailer);
  const company = detailer.company || detailer.name || 'Our team';
  if (!chatEligible(detailer) || !settings.enabled) {
    return Response.json({ available: false, reason: chatEligible(detailer) ? 'disabled' : 'plan', company, quoteUrl: publicRequestUrl(appBaseUrl(request), detailer) }, { headers: CORS });
  }
  return Response.json({
    available: true,
    company,
    logo: detailer.theme_logo_url || detailer.logo_url || null,
    colors: brandColors(detailer.theme_primary),
    greeting: settings.greeting || `Hi! I can answer common questions about ${company}. What would you like to know?`,
    quoteUrl: publicRequestUrl(appBaseUrl(request), detailer),
    holdHarmless: HOLD_HARMLESS_NOTE,
    consentText: SMS_CONSENT_TEXT(company),
  }, { headers: CORS });
}
