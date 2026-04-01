import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Call Anthropic API directly
async function callClaude(systemPrompt, userMessage) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

// Default questions if none configured
const DEFAULT_QUESTIONS = [
  { key: 'name', question: 'What is your name?', required: true },
  { key: 'email', question: 'What is your email address?', required: true },
  { key: 'phone', question: 'What is your phone number?', required: false },
  { key: 'aircraft_type', question: 'What type of aircraft do you have?', required: true },
  { key: 'location', question: 'Where is your aircraft located?', required: true },
  { key: 'services', question: 'What services are you interested in?', required: true },
];

// GET - Get widget config for embedding
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // Accept both 'id' and 'detailer_id' parameter names for compatibility
    const detailerId = searchParams.get('detailer_id') || searchParams.get('id');

    if (!detailerId) {
      return Response.json({ error: 'Detailer ID required' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get detailer info
    const { data: detailer, error: detailerError } = await supabase
      .from('detailers')
      .select('id, company, logo_url, plan')
      .eq('id', detailerId)
      .single();

    if (detailerError || !detailer) {
      return Response.json({ error: 'Detailer not found' }, { status: 404 });
    }

    // Get custom questions
    const { data: questions } = await supabase
      .from('intake_questions')
      .select('*')
      .eq('detailer_id', detailerId)
      .order('display_order', { ascending: true });

    // Get FAQs for AI responses
    const { data: faqData } = await supabase
      .from('intake_faqs')
      .select('faqs')
      .eq('detailer_id', detailerId)
      .single();

    const formattedQuestions = questions?.length
      ? questions.map(q => ({
          key: q.question_key,
          question: q.question_text,
          placeholder: q.placeholder,
          required: q.required,
          type: q.question_type,
          options: q.options,
        }))
      : DEFAULT_QUESTIONS;

    return Response.json({
      detailer: {
        id: detailer.id,
        name: detailer.company,
        logo: detailer.logo_url,
        plan: detailer.plan || 'free',
      },
      questions: formattedQuestions,
      faqs: faqData?.faqs || [],
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Handle chat message (AI responses)
export async function POST(request) {
  try {
    const { detailer_id, message, context, answers } = await request.json();

    if (!detailer_id) {
      return Response.json({ error: 'Detailer ID required' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, company')
      .eq('id', detailer_id)
      .single();

    if (!detailer) {
      return Response.json({ error: 'Detailer not found' }, { status: 404 });
    }

    // Get FAQs
    const { data: faqData } = await supabase
      .from('intake_faqs')
      .select('faqs')
      .eq('detailer_id', detailer_id)
      .single();

    const faqs = faqData?.faqs || [];

    const faqContext = faqs.length
      ? `Available FAQs:\n${faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
      : '';

    // Try to use Claude
    const aiResponse = await callClaude(
      `You are a helpful assistant for ${detailer.company}, an aircraft detailing company.
You're collecting information from potential customers for a quote.
Be friendly, professional, and concise (1-2 sentences max).
If asked about pricing, say you'll provide a custom quote based on their aircraft.
${faqContext}

Current conversation context: ${JSON.stringify(context || {})}
Information collected so far: ${JSON.stringify(answers || {})}`,
      message
    );

    if (aiResponse) {
      return Response.json({
        response: aiResponse,
        isAiResponse: true,
      });
    }

    // Fallback response
    return Response.json({
      response: "Thanks for your message! I'll collect your information and have someone reach out to you shortly.",
      isAiResponse: false,
    });

  } catch (err) {
    console.error('Widget chat error:', err);
    return Response.json({
      response: "I'm here to help! Let me collect some information to get you a quote.",
      isAiResponse: false,
    });
  }
}
