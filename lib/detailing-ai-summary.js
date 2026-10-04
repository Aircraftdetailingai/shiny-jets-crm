// Server-only: rolling summaries for long Detailing AI chats. Never throws; falls back to an
// extractive summary when no AI provider answers.
import { SUMMARY_SYSTEM, summaryRequestText, extractiveSummary, SUMMARY_MAX_CHARS } from '@/lib/detailing-ai-context';
import { scrubRupes, scrubCompoundPro, applyBrandRules } from '@/lib/detailing-ai-messages';
import { toMethodsWording } from '@/lib/detailing-ai-knowledge';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_SUMMARY_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const ANTHROPIC_BASE_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function clean(text) {
  const t = toMethodsWording(scrubCompoundPro(scrubRupes(applyBrandRules(String(text || ''), [])), 'compound')).trim();
  return t.slice(0, SUMMARY_MAX_CHARS);
}

export async function summarizeMessages({ previousSummary = '', messages = [] }) {
  const fallback = () => {
    const extra = extractiveSummary(messages, Math.max(400, SUMMARY_MAX_CHARS - (previousSummary || '').length - 2));
    return { summary: clean([previousSummary, extra].filter(Boolean).join('\n')), source: 'extractive' };
  };
  if (!messages.length) return { summary: previousSummary || '', source: 'none' };
  const user = summaryRequestText(previousSummary, messages);
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 500, system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: user }] }),
      });
      if (!res.ok) return fallback();
      const data = await res.json();
      const text = (data?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
      return text.trim() ? { summary: clean(text), source: 'ai' } : fallback();
    }
    if (process.env.OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: OPENAI_MODEL, max_tokens: 500, messages: [{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: user }] }),
      });
      if (!res.ok) return fallback();
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return text.trim() ? { summary: clean(text), source: 'ai' } : fallback();
    }
  } catch (e) {
    console.error('[detailing-ai/summary] failed:', e?.message || e);
  }
  return fallback();
}
