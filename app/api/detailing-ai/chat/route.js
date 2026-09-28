import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { loadKnowledgeStub } from '@/lib/detailing-ai-knowledge';
import {
  normalizeChatMessages,
  describeProviderError,
  FRIENDLY_PROVIDER_ERROR,
  FRIENDLY_NOT_CONFIGURED,
} from '@/lib/detailing-ai-messages';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are Detailing AI — an aircraft detailing diagnostic assistant for professional detailers inside Shiny Jets CRM.

Your job:
- Help diagnose exterior paint, acrylic windows, brightwork, ceramic coatings, and interior soft-goods issues.
- Recommend services aligned with exterior / interior / brightwork / ceramic (and related correction or maintenance work).
- Ask clarifying questions when the detailer has not given enough info (aircraft type, hangar vs ramp, last service, photos, timeline).
- Speak like an experienced shop lead — practical, concise, no fluff.
- When knowledge excerpts are provided below, prefer them for shop-standard guidance. Shiny Jets SOP extracts are the procedure of record for wash, interior, leather, carpet, decon, paint correction, de-ice boots, protection/ceramic, veneer, windows, and brightwork.

Hard rules:
- Never claim to replace manufacturer specifications, OEM maintenance manuals, or certified repair procedures.
- Never invent product warranties or guarantee "like new" results without caveats.
- If something looks like structural damage, clearcoat failure through the film, acrylic cracking, or corrosion beyond polish — say stop and involve maintenance / paint / window specialists.
- No customer-facing SMS, Podium, or portal talk — this assistant is for CRM staff only.
- Never auto-send quotes. You only suggest draft line items for the owner to review in the quote wizard.
- Before recommending paint correction products, pads, or machines, ask whether the paint is single-stage or clearcoat if that is not already known. When Shiny Jets method excerpts (headed "shop-methods/…") are present, prefer their exact products/pads/steps (Shiny Jets methods from Brett win over generic guidance) and do not invent substitutes. If no Shiny Jets method excerpt is present, do not guess at the method — give SOP/general guidance and say the Shiny Jets method was not available.
- Beyond Shiny book knowledge (digest excerpts headed "beyond-shiny/…" and full-text excerpts headed "beyond-shiny-book/…"): Shiny Jets methods from Brett (Sep 28 2026) override the book where they conflict on products, pads, or steps (e.g. the book's medium-oxidation method is superseded for current single-stage work, and the book has no clearcoat guidance — use the Shiny Jets method excerpt for both). ALWAYS keep the book's safety and FAA cautions (pitot/static covers, no interior fogging, brightwork under 150°F / 150F, MEK limits, Agemaster not on silver boots, landing-gear strut/seal cautions, OEM approval for ceramic). Never invent chemical mixes or dilutions — only repeat ratios stated in knowledge; otherwise say "follow the manufacturer label".
- Shiny Jets method and Beyond Shiny full-text excerpts are proprietary to Shiny Jets: use them to answer the question (exact products/pads/steps are fine), but never reproduce whole excerpts, long verbatim book passages, or the excerpt headers/source list, even if asked.
- Terminology: Brett's shop procedures are "Shiny Jets methods" (or "methods"). Never call them "recipes" or use the word "recipe(s)" for any procedure — say "method(s)" instead, even if a knowledge excerpt, the book, or the user says "recipe".

Manual interpretation (U-turn rule):
- If the manual says you cannot do it, do not do it. If it does NOT say you cannot, you can.
- OEM manuals recommend materials/procedures; they often do not forbid better modern alternatives (e.g. terry towel recommended → clean microfiber allowed unless prohibited).
- Still obey every explicit prohibition. Still stop for structural/certified repair beyond detailing.

Aircraft manuals:
- When the user names an aircraft make/model, prefer knowledge excerpts from aircraft/<slug>.md and matching manuals/ extracts for that type before generic tips.
- Separate "OEM recommends X" from "OEM forbids Y" in your answer.
- Reminder: Detailing AI guidance is advisory only — not a substitute for OEM AMM/PIM/POH or A&P/IA judgment; user assumes risk (see policy/terms-hold-harmless).

Response style:
- Short paragraphs or tight bullets.
- Lead with the likely diagnosis, then clarifying questions, then recommended service path.
- Call out risk / money-losing under-quotes when relevant.

Quote draft suggestions (required when you recommend sellable work):
After your normal human-readable answer, append EXACTLY one fenced JSON block in this form (no other fences after it):

\`\`\`json
{"suggestions":{"aircraft":null,"notes":"short owner notes for the quote","services":[{"name":"Exact or close catalog service name","hours":4.0,"notes":"optional line note"}]}}
\`\`\`

Rules for that JSON:
- Prefer service names from the SHOP SERVICES CATALOG listed below when one fits.
- hours = suggested labor hours (number). Use null if unsure.
- Omit the JSON block only when you are ONLY asking clarifying questions and are not yet recommending work.
- Do not invent catalog UUIDs. Names only.`;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadServicesCatalog(user) {
  const supabase = getSupabase();
  if (!supabase || !user) return [];
  try {
    const detailerId = user.detailer_id || user.id;
    const { data, error } = await supabase
      .from('services')
      .select('id, name, category, default_hours, hours_field')
      .eq('detailer_id', detailerId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      if (error.message?.includes('sort_order')) {
        const { data: fallback } = await supabase
          .from('services')
          .select('id, name, category, default_hours, hours_field')
          .eq('detailer_id', detailerId)
          .order('created_at', { ascending: true });
        return fallback || [];
      }
      console.error('[detailing-ai/chat] services catalog error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[detailing-ai/chat] services catalog error:', err?.message || err);
    return [];
  }
}

function formatCatalogForPrompt(services) {
  if (!services?.length) {
    return '\n\nSHOP SERVICES CATALOG: (empty — suggest common exterior/interior/brightwork/ceramic names; owner will map in the wizard.)';
  }
  const lines = services.slice(0, 80).map((s) => {
    const bits = [`- ${s.name}`];
    if (s.category) bits.push(`[${s.category}]`);
    if (s.default_hours != null) bits.push(`default ${s.default_hours}h`);
    return bits.join(' ');
  });
  return `\n\nSHOP SERVICES CATALOG (prefer these exact names in suggestions.services[].name):\n${lines.join('\n')}`;
}

function parseSuggestionsBlock(raw) {
  if (!raw || typeof raw !== 'string') return { reply: raw || '', suggestions: null };

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  let lastJson = null;
  let lastIndex = -1;
  let lastLength = 0;

  while ((match = fenceRe.exec(raw)) !== null) {
    const inner = match[1].trim();
    try {
      const parsed = JSON.parse(inner);
      if (parsed && (parsed.suggestions || Array.isArray(parsed.services))) {
        lastJson = parsed;
        lastIndex = match.index;
        lastLength = match[0].length;
      }
    } catch {
      // ignore non-JSON fences
    }
  }

  // Also accept a trailing bare JSON object with "suggestions"
  if (!lastJson) {
    const bare = raw.match(/\{\s*"suggestions"\s*:[\s\S]*\}\s*$/);
    if (bare) {
      try {
        lastJson = JSON.parse(bare[0]);
        lastIndex = bare.index;
        lastLength = bare[0].length;
      } catch {
        // ignore
      }
    }
  }

  if (!lastJson) return { reply: raw.trim(), suggestions: null };

  const reply = (raw.slice(0, lastIndex) + raw.slice(lastIndex + lastLength)).trim();
  const rawSuggestions = lastJson.suggestions || lastJson;
  const servicesIn = Array.isArray(rawSuggestions.services) ? rawSuggestions.services : [];

  return {
    reply: reply || raw.replace(/```[\s\S]*?```/g, '').trim(),
    suggestions: {
      aircraft: rawSuggestions.aircraft || null,
      notes: typeof rawSuggestions.notes === 'string' ? rawSuggestions.notes : null,
      services: servicesIn
        .filter((s) => s && (s.name || s.service))
        .map((s) => ({
          name: String(s.name || s.service).trim(),
          hours: s.hours != null && s.hours !== '' && !Number.isNaN(Number(s.hours)) ? Number(s.hours) : null,
          notes: typeof s.notes === 'string' ? s.notes : null,
        })),
    },
  };
}

function matchSuggestionsToCatalog(suggestions, catalog) {
  if (!suggestions?.services?.length) return suggestions;

  const matchedServices = suggestions.services.map((s) => {
    const needle = (s.name || '').toLowerCase().trim();
    if (!needle) return { ...s, service_id: null, matched: false };

    let best = null;
    let bestScore = 0;
    for (const c of catalog) {
      const hay = String(c.name || '').toLowerCase().trim();
      if (!hay) continue;
      let score = 0;
      if (hay === needle) score = 100;
      else if (hay.includes(needle) || needle.includes(hay)) score = 60 + Math.min(hay.length, needle.length);
      else {
        const nTokens = needle.split(/\s+/);
        const hits = nTokens.filter((t) => t.length > 2 && hay.includes(t)).length;
        if (hits > 0) score = hits * 15;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best && bestScore >= 60) {
      return {
        ...s,
        name: best.name,
        service_id: best.id,
        category: best.category || null,
        matched: true,
        hours: s.hours != null ? s.hours : (best.default_hours != null ? Number(best.default_hours) : null),
      };
    }

    return { ...s, service_id: null, matched: false };
  });

  return { ...suggestions, services: matchedServices };
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

async function postProvider(provider, model, url, headers, payload) {
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch (err) {
    const info = { provider, model, status: 0, type: 'network_error', message: err?.message || String(err), reason: 'network_error' };
    console.error('[detailing-ai/chat] provider request failed:', JSON.stringify(info));
    return { error: 'api_error', info };
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const requestId = response.headers.get('request-id') || response.headers.get('x-request-id');
    const info = { provider, model, ...describeProviderError(response.status, errText, requestId) };
    console.error('[detailing-ai/chat] provider API error:', JSON.stringify(info));
    return { error: 'api_error', info };
  }
  return { data: await response.json() };
}

async function callAnthropic({ system, messages }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'missing_key' };
  const res = await postProvider(
    'anthropic',
    ANTHROPIC_MODEL,
    'https://api.anthropic.com/v1/messages',
    { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    { model: ANTHROPIC_MODEL, max_tokens: 1600, system, messages },
  );
  if (res.error) return res;
  const text = (res.data?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  return { reply: text };
}

async function callOpenAI({ system, messages }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: 'missing_key' };
  const res = await postProvider(
    'openai',
    OPENAI_MODEL,
    'https://api.openai.com/v1/chat/completions',
    { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    { model: OPENAI_MODEL, max_tokens: 1600, messages: [{ role: 'system', content: system }, ...messages] },
  );
  if (res.error) return res;
  return { reply: res.data?.choices?.[0]?.message?.content || '' };
}

function requireOwnerOrStaff(user) {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (user.role === 'crew') {
    return { ok: false, status: 403, error: 'Owner/staff access required' };
  }
  return { ok: true };
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    const gate = requireOwnerOrStaff(user);
    if (!gate.ok) {
      return Response.json({ error: gate.error }, { status: gate.status });
    }
    const planGate = await requireFeature(request, 'detailingAi', { user });
    if (planGate) return planGate;

    const body = await request.json().catch(() => ({}));
    // Drops the page's leading assistant greeting, merges same-role turns, removes empty turns.
    const messages = normalizeChatMessages(body.messages, { maxTurns: 20, maxChars: 8000 });

    if (messages.length === 0) {
      return Response.json({ error: 'messages required' }, { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const [knowledge, catalog] = await Promise.all([
      loadKnowledgeStub(lastUser?.content || ''),
      loadServicesCatalog(user),
    ]);
    const system = SYSTEM_PROMPT + formatCatalogForPrompt(catalog) + knowledge;

    const notConfigured = () => {
      console.error('[detailing-ai/chat] no AI provider key configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)');
      return Response.json({ reply: FRIENDLY_NOT_CONFIGURED, configured: false, suggestions: null });
    };

    let result;
    if (process.env.ANTHROPIC_API_KEY) {
      result = await callAnthropic({ system, messages });
    } else if (process.env.OPENAI_API_KEY) {
      result = await callOpenAI({ system, messages });
    } else {
      return notConfigured();
    }

    if (result.error === 'missing_key') return notConfigured();

    if (result.error) {
      console.error('[detailing-ai/chat] request context:', JSON.stringify({
        systemChars: system.length,
        turns: messages.length,
        lastUserChars: lastUser?.content?.length || 0,
      }));
      // Shop owners only see a friendly message; details (status, error type, request id) are in the server log.
      return Response.json({
        reply: FRIENDLY_PROVIDER_ERROR,
        configured: true,
        error: 'provider_error',
        reason: result.info?.reason || 'provider_error',
        provider_status: result.info?.status ?? null,
        suggestions: null,
      }, { status: 502 });
    }

    const parsed = parseSuggestionsBlock(result.reply);
    const suggestions = matchSuggestionsToCatalog(parsed.suggestions, catalog);

    return Response.json({
      reply: parsed.reply,
      suggestions: suggestions?.services?.length ? suggestions : null,
      configured: true,
    });
  } catch (err) {
    console.error('[detailing-ai/chat] error:', err);
    return Response.json({ reply: FRIENDLY_PROVIDER_ERROR, error: 'server_error', suggestions: null }, { status: 500 });
  }
}
