import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Call Anthropic API directly
async function callClaude(userMessage) {
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
        max_tokens: 2048,
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

// POST - Upload and parse FAQ document
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const textContent = formData.get('text');

    let content = textContent || '';

    if (file && !textContent) {
      // Read file content
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder().decode(buffer);
      content = text;
    }

    if (!content) {
      return Response.json({ error: 'No content provided' }, { status: 400 });
    }

    // Limit content size
    content = content.slice(0, 20000);

    // Try to use Claude
    const aiResponse = await callClaude(
      `Extract FAQ question-answer pairs from this content, and suggest intake questions for a lead form.

Content:
${content}

Return JSON with two arrays:
1. "faqs" - Extracted Q&A pairs with "question" and "answer" fields
2. "suggestedQuestions" - Questions to ask leads based on the FAQ, with "question" and "key" (snake_case) fields

Example:
{
  "faqs": [
    {"question": "How long does a detail take?", "answer": "4-8 hours depending on size."}
  ],
  "suggestedQuestions": [
    {"question": "What is the size of your aircraft?", "key": "aircraft_size"}
  ]
}

Return ONLY the JSON object, no other text.`
    );

    let result = { faqs: [], suggestedQuestions: [] };

    if (aiResponse) {
      try {
        result = JSON.parse(aiResponse);
      } catch (e) {
        console.error('Failed to parse AI response:', e);
      }
    }

    // If AI didn't work, return mock data
    if (!result.faqs?.length) {
      return Response.json({
        success: true,
        faqs: [
          {
            question: 'How long does a full detail take?',
            answer: 'A full detail typically takes 4-8 hours depending on aircraft size.',
          },
          {
            question: 'Do you offer mobile services?',
            answer: 'Yes, we come to your hangar or FBO.',
          },
        ],
        suggestedQuestions: [
          {
            question: 'What is the size of your aircraft?',
            key: 'aircraft_size',
          },
        ],
        parsed: false,
      });
    }

    // Store FAQs for the quote widget to use
    if (result.faqs?.length) {
      await supabase
        .from('intake_faqs')
        .upsert({
          detailer_id: user.id,
          faqs: result.faqs,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'detailer_id' });
    }

    return Response.json({
      success: true,
      faqs: result.faqs || [],
      suggestedQuestions: result.suggestedQuestions || [],
      parsed: true,
    });

  } catch (err) {
    console.error('FAQ upload error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// GET - Get stored FAQs
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: faqData, error } = await supabase
      .from('intake_faqs')
      .select('*')
      .eq('detailer_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ faqs: faqData?.faqs || [] });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
