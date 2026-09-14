import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

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

const KNOWLEDGE_NEEDLES = [
  'oxid',
  'acrylic',
  'haze',
  'brightwork',
  'ceramic',
  'interior',
  'odor',
  'leather',
  'polish',
  'window',
  'wash',
  'carpet',
  'decontaminat',
  'de-ice',
  'deice',
  'boot',
  'veneer',
  'cabinetry',
  'paint',
  'soot',
  'skydrol',
  'alcantara',
  'suede',
  'wax',
  'compound',
  'clearcoat',
  'pitot',
  'sop',
  'manual',
  'poh',
  'pim',
  'amm',
  'microfiber',
  'terry',
  'solvent',
  'soap',
  'corrosion',
  'plexiglass',
  'plexiglas',
  'aluminum',
  'exterior',
  'cloth',
  'chamois',
  'prohibited',
  'beechcraft',
  'baron',
  'bonanza',
  'cessna',
  'skyhawk',
  'citation',
  'hawker',
  'king air',
  'gulfstream',
  'embraer',
  'phenom',
  'pilatus',
  'piper',
  'bell',
  'helicopter',
  'hold-harmless',
  'policy',
];

async function collectMarkdownFiles(dir, relative = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdownFiles(full, rel)));
    } else if (entry.name.endsWith('.md')) {
      out.push({ rel, full });
    }
  }
  return out;
}

async function loadKnowledgeStub(userMessage) {
  // Recurse knowledge/detailing/** so existing stubs and sops/ are both included.
  const root = path.join(process.cwd(), 'knowledge', 'detailing');
  try {
    const files = await collectMarkdownFiles(root);
    if (files.length === 0) return '';

    const lower = (userMessage || '').toLowerCase();
    const scored = [];
    for (const { rel, full } of files) {
      const text = await readFile(full, 'utf8');
      const keywords = rel.replace(/\.md$/, '').split(/[-_./]/);
      let score = 0;
      for (const kw of keywords) {
        if (kw.length > 2 && lower.includes(kw)) score += 2;
      }
      if (rel.includes('sops') && (lower.includes('sop') || lower.includes('procedure'))) {
        score += 3;
      }
      if (rel.includes('manuals/') || rel.includes('policy/')) {
        score += 2;
      }
      if (rel.includes('aircraft/') || rel.includes('type-class/')) {
        score += 2;
      }
      // Boost exact aircraft profile when make/model tokens appear in the user message
      if (rel.startsWith('aircraft/')) {
        const tokens = rel.replace(/^aircraft\//, '').replace(/\.md$/, '').split('-').filter((t) => t.length > 2);
        let hits = 0;
        for (const t of tokens) {
          if (lower.includes(t)) hits += 1;
        }
        if (hits >= 2) score += 8;
        else if (hits === 1) score += 3;
      }
      const hay = text.toLowerCase();
      for (const n of KNOWLEDGE_NEEDLES) {
        if (lower.includes(n) && hay.includes(n)) score += 1;
      }
      scored.push({ file: rel, text, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((s) => s.score > 0).slice(0, 6);
    const chosen = top.length > 0 ? top : scored.slice(0, 2);

    const excerpts = chosen
      .map((c) => {
        let cap = 3500;
        if (c.file.includes('sops/') || c.file.includes('aircraft/') || c.file.includes('manuals/') || c.file.includes('policy/')) {
          cap = 5500;
        }
        return `### ${c.file}\n${c.text.slice(0, cap)}`;
      })
      .join('\n\n');

    return `\n\n---\nKnowledge base excerpts (RAG stub — prefer these when relevant):\n${excerpts}\n---`;
  } catch (err) {
    console.error('[detailing-ai/chat] knowledge stub error:', err?.message || err);
    return '';
  }
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

async function callAnthropic({ system, messages }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'missing_key' };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1600,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[detailing-ai/chat] Claude API error:', response.status, errText);
    return { error: 'api_error', status: response.status, detail: errText.slice(0, 300) };
  }

  const data = await response.json();
  return { reply: data.content?.[0]?.text || '' };
}

async function callOpenAI({ system, messages }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: 'missing_key' };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1600,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[detailing-ai/chat] OpenAI API error:', response.status, errText);
    return { error: 'api_error', status: response.status, detail: errText.slice(0, 300) };
  }

  const data = await response.json();
  return { reply: data.choices?.[0]?.message?.content || '' };
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

    const body = await request.json().catch(() => ({}));
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const messages = incoming
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.slice(0, 8000) }))
      .slice(-20);

    if (messages.length === 0) {
      return Response.json({ error: 'messages required' }, { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const [knowledge, catalog] = await Promise.all([
      loadKnowledgeStub(lastUser?.content || ''),
      loadServicesCatalog(user),
    ]);
    const system = SYSTEM_PROMPT + formatCatalogForPrompt(catalog) + knowledge;

    let result;
    if (process.env.ANTHROPIC_API_KEY) {
      result = await callAnthropic({ system, messages });
    } else if (process.env.OPENAI_API_KEY) {
      result = await callOpenAI({ system, messages });
    } else {
      return Response.json({
        reply:
          'Detailing AI is not configured yet. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in the environment, then try again.',
        configured: false,
        suggestions: null,
      });
    }

    if (result.error === 'missing_key') {
      return Response.json({
        reply:
          'Detailing AI is not configured yet. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in the environment, then try again.',
        configured: false,
        suggestions: null,
      });
    }

    if (result.error) {
      return Response.json({
        reply:
          'The AI provider returned an error. Check the API key and try again. If this keeps happening, verify ANTHROPIC_API_KEY / OPENAI_API_KEY in env.',
        configured: true,
        error: 'provider_error',
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
    return Response.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
