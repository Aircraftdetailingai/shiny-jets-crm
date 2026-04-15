import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const { detailerId, messages, sessionId } = await request.json();
    if (!detailerId) return Response.json({ error: 'detailerId required' }, { status: 400 });

    const supabase = getSupabase();

    // Fetch detailer context
    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, company, name, home_airport, theme_primary')
      .eq('id', detailerId)
      .single();

    if (!detailer) return Response.json({ error: 'Detailer not found' }, { status: 404 });

    // Fetch services
    const { data: services } = await supabase
      .from('services')
      .select('name, base_price, description')
      .eq('detailer_id', detailerId)
      .limit(30);

    // Fetch FAQs
    const { data: faqData } = await supabase
      .from('intake_faqs')
      .select('faqs')
      .eq('detailer_id', detailerId)
      .maybeSingle();

    // Fetch custom intake questions
    const { data: intakeQuestions } = await supabase
      .from('intake_questions')
      .select('question_text, question_key')
      .eq('detailer_id', detailerId)
      .order('display_order');

    const companyName = detailer.company || detailer.name || 'our company';
    const serviceList = (services || []).map(s => {
      let desc = s.name;
      if (s.base_price > 0) desc += ` (from $${s.base_price})`;
      return desc;
    }).join(', ') || 'exterior wash, interior detail, ceramic coating, paint correction';

    const faqSection = (faqData?.faqs || []).length > 0
      ? '\n\nFAQs you can reference:\n' + faqData.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
      : '';

    const customQs = (intakeQuestions || []).length > 0
      ? '\n\nCustom questions to work into the conversation naturally:\n' + intakeQuestions.map(q => `- ${q.question_text}`).join('\n')
      : '';

    const systemPrompt = `You are a friendly quote assistant for ${companyName}, an aircraft detailing company.${detailer.home_airport ? ` Based at ${detailer.home_airport}.` : ''}

Services offered: ${serviceList}
${faqSection}
${customQs}

Your goal is to collect this information through natural conversation:
1. Aircraft type (make and model)
2. Tail number (ask but it's optional)
3. Which services they want
4. When they want the service done
5. Their name
6. Email address
7. Phone number (optional)

Rules:
- Be conversational and warm, not robotic — like texting a knowledgeable friend
- Ask ONE question at a time
- If they ask about pricing, give ranges from the services list above
- Keep responses to 1-3 sentences max
- Never make up services not in the list above
- When you have all the required info (aircraft, services, name, email), summarize what you collected and ask them to confirm
- After they confirm, respond with EXACTLY this on its own line: [LEAD_COMPLETE]
- Include the collected data as JSON on the next line: {"name":"...","email":"...","phone":"...","aircraft":"...","tail_number":"...","services":"...","date":"...","notes":"..."}`;

    // Build conversation for Claude
    const conversationMessages = (messages || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // If no messages, this is a greeting request
    if (conversationMessages.length === 0) {
      conversationMessages.push({ role: 'user', content: 'Hi' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({
        reply: `Hi! I'm here to help you get a quote from ${companyName}. What type of aircraft do you have?`,
        complete: false,
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[widget/chat] Claude API error:', response.status, errText);
      return Response.json({
        reply: `Thanks for reaching out! Tell me about your aircraft and what services you're looking for, and I'll help get you a quote from ${companyName}.`,
        complete: false,
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    // Check if lead is complete
    if (reply.includes('[LEAD_COMPLETE]')) {
      const cleanReply = reply.split('[LEAD_COMPLETE]')[0].trim();

      // Try to parse the JSON data
      let leadData = {};
      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) leadData = JSON.parse(jsonMatch[0]);
      } catch {}

      // Create lead record
      let leadId = null;
      try {
        const leadEntry = {
          detailer_id: detailerId,
          customer_name: leadData.name || 'Website Visitor',
          customer_email: leadData.email || null,
          customer_phone: leadData.phone || null,
          source: 'chatbot',
          status: 'new',
          answers: {
            aircraft: leadData.aircraft || '',
            tail_number: leadData.tail_number || '',
            services: leadData.services || '',
            date: leadData.date || '',
            notes: leadData.notes || '',
          },
        };

        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: lead, error } = await supabase.from('intake_leads').insert(leadEntry).select('id').single();
          if (!error) { leadId = lead.id; break; }
          const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
          if (colMatch) { delete leadEntry[colMatch[1]]; continue; }
          console.error('[widget/chat] lead insert error:', error.message);
          break;
        }
      } catch (e) {
        console.error('[widget/chat] lead creation error:', e);
      }

      // Send notification email to detailer
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data: detailerEmail } = await supabase.from('detailers').select('email').eq('id', detailerId).single();
        if (detailerEmail?.email) {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
            to: detailerEmail.email,
            subject: `New Lead from Website Chatbot — ${leadData.name || 'Website Visitor'}`,
            html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
              <h2 style="color:#0D1B2A;">New Quote Request</h2>
              <p>Someone just completed a quote conversation on your website chatbot.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:6px 0;color:#666;font-size:13px;width:100px;">Name</td><td style="padding:6px 0;font-weight:600;">${leadData.name || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;font-size:13px;">Email</td><td style="padding:6px 0;">${leadData.email || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;font-size:13px;">Phone</td><td style="padding:6px 0;">${leadData.phone || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;font-size:13px;">Aircraft</td><td style="padding:6px 0;">${leadData.aircraft || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;font-size:13px;">Services</td><td style="padding:6px 0;">${leadData.services || '—'}</td></tr>
                <tr><td style="padding:6px 0;color:#666;font-size:13px;">Date</td><td style="padding:6px 0;">${leadData.date || '—'}</td></tr>
              </table>
              <a href="https://crm.shinyjets.com/leads" style="display:inline-block;background:#007CB1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;font-size:14px;">View in CRM</a>
            </div>`,
          });
        }
      } catch (e) {
        console.error('[widget/chat] email notification error:', e);
      }

      return Response.json({ reply: cleanReply, complete: true, leadId });
    }

    return Response.json({ reply, complete: false });

  } catch (err) {
    console.error('[widget/chat] error:', err);
    return Response.json({
      reply: "Thanks for your interest! Could you tell me about your aircraft and what services you're looking for?",
      complete: false,
    });
  }
}
