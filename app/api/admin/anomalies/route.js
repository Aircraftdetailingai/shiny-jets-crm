import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

function extractJson(text) {
  if (!text) return null;
  // Try raw parse first
  try {
    return JSON.parse(text);
  } catch {}
  // Try to grab the first JSON object from the text
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  return null;
}

export async function POST(request) {
  try {
    if (!(await isAdmin(request))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data: rows, error } = await supabase
      .from('aggregate_service_hours')
      .select('*');

    if (error) {
      console.error('aggregate fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const systemPrompt =
      'You are a data analyst for an aircraft detailing CRM. Analyze the aggregate service hours data and identify anomalies.';
    const userMessage = `Here is the aggregate service hours data as JSON:\n\n${JSON.stringify(
      rows || [],
      null,
      2
    )}\n\nFind unusual data points: services with HIGH hours (potential premium service or inefficiency) vs LOW hours (potential underpricing or data error). Return JSON with format: { anomalies: [{ service: '', category: '', avg_hours: N, anomaly_type: 'high'|'low', explanation: '', is_profitable: bool }], summary: 'string' }`;

    let claudeResponse;
    try {
      claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } catch (fetchErr) {
      console.error('Anthropic fetch error:', fetchErr);
      return Response.json(
        { error: 'Failed to reach Anthropic API', anomalies: [], summary: '' },
        { status: 502 }
      );
    }

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text().catch(() => '');
      console.error('Anthropic API error:', claudeResponse.status, errText);
      return Response.json(
        { error: 'Anthropic API error', status: claudeResponse.status, anomalies: [], summary: '' },
        { status: 502 }
      );
    }

    const claudeJson = await claudeResponse.json();
    const text = claudeJson?.content?.[0]?.text || '';
    const parsed = extractJson(text);

    if (!parsed) {
      return Response.json({
        anomalies: [],
        summary: 'Unable to parse AI response.',
        raw: text,
      });
    }

    return Response.json({
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    });
  } catch (e) {
    console.error('anomalies POST exception:', e);
    return Response.json(
      { error: e.message || 'Server error', anomalies: [], summary: '' },
      { status: 500 }
    );
  }
}
