import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are Detailing AI — an aircraft detailing diagnostic assistant for professional detailers inside Shiny Jets CRM.

Your job:
- Help diagnose exterior paint, acrylic windows, brightwork, ceramic coatings, and interior soft-goods issues.
- Recommend services aligned with exterior / interior / brightwork / ceramic (and related correction or maintenance work).
- Ask clarifying questions when the detailer has not given enough info (aircraft type, hangar vs ramp, last service, photos, timeline).
- Speak like an experienced shop lead — practical, concise, no fluff.
- When knowledge excerpts are provided below, prefer them for shop-standard guidance.

Hard rules:
- Never claim to replace manufacturer specifications, OEM maintenance manuals, or certified repair procedures.
- Never invent product warranties or guarantee "like new" results without caveats.
- If something looks like structural damage, clearcoat failure through the film, acrylic cracking, or corrosion beyond polish — say stop and involve maintenance / paint / window specialists.
- No customer-facing SMS, Podium, or portal talk — this assistant is for CRM staff only.
- If you recommend a quote path, keep it high-level (service categories + what to inspect); quote drafting wiring comes later.

Response style:
- Short paragraphs or tight bullets.
- Lead with the likely diagnosis, then clarifying questions, then recommended service path.
- Call out risk / money-losing under-quotes when relevant.`;

async function loadKnowledgeStub(userMessage) {
  const dir = path.join(process.cwd(), 'knowledge', 'detailing');
  try {
    const files = await readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
    if (mdFiles.length === 0) return '';

    const lower = (userMessage || '').toLowerCase();
    const scored = [];
    for (const file of mdFiles) {
      const full = path.join(dir, file);
      const text = await readFile(full, 'utf8');
      const keywords = file.replace(/\.md$/, '').split(/[-_]/);
      let score = 0;
      for (const kw of keywords) {
        if (kw.length > 2 && lower.includes(kw)) score += 2;
      }
      // Light content match
      const needles = ['oxid', 'acrylic', 'haze', 'brightwork', 'ceramic', 'interior', 'odor', 'leather', 'polish', 'window'];
      for (const n of needles) {
        if (lower.includes(n) && text.toLowerCase().includes(n)) score += 1;
      }
      scored.push({ file, text, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((s) => s.score > 0).slice(0, 3);
    const chosen = top.length > 0 ? top : scored.slice(0, 2);

    const excerpts = chosen
      .map((c) => `### ${c.file}\n${c.text.slice(0, 3500)}`)
      .join('\n\n');

    return `\n\n---\nKnowledge base excerpts (RAG stub — prefer these when relevant):\n${excerpts}\n---`;
  } catch (err) {
    console.error('[detailing-ai/chat] knowledge stub error:', err?.message || err);
    return '';
  }
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
      max_tokens: 1200,
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
      max_tokens: 1200,
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
  // Crew JWTs are for the crew app — Detailing AI is CRM owner/staff only.
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
    const knowledge = await loadKnowledgeStub(lastUser?.content || '');
    const system = SYSTEM_PROMPT + knowledge;

    // Prefer Anthropic (existing CRM pattern); fall back to OpenAI if present.
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
      });
    }

    if (result.error === 'missing_key') {
      return Response.json({
        reply:
          'Detailing AI is not configured yet. Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in the environment, then try again.',
        configured: false,
      });
    }

    if (result.error) {
      return Response.json({
        reply:
          'The AI provider returned an error. Check the API key and try again. If this keeps happening, verify ANTHROPIC_API_KEY / OPENAI_API_KEY in env.',
        configured: true,
        error: 'provider_error',
      }, { status: 502 });
    }

    return Response.json({ reply: result.reply, configured: true });
  } catch (err) {
    console.error('[detailing-ai/chat] error:', err);
    return Response.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
