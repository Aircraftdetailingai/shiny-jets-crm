import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get user's testimonials and check if prompt should show
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

    // Get user's existing testimonials
    const { data: testimonials } = await supabase
      .from('testimonials')
      .select('*')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: false });

    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('testimonial_given, last_testimonial_prompt, created_at')
      .eq('id', user.id)
      .single();

    // Get total revenue to check milestones
    const { data: quotes } = await supabase
      .from('quotes')
      .select('total_price, status')
      .eq('detailer_id', user.id)
      .in('status', ['paid', 'completed']);

    const totalRevenue = (quotes || []).reduce((sum, q) => sum + (q.total_price || 0), 0);

    // Determine if we should show testimonial prompt
    let showPrompt = false;
    let currentMilestone = null;

    if (!detailer?.testimonial_given) {
      // Check milestones in order
      const milestoneThresholds = [
        { key: 'first_100k', amount: 100000 },
        { key: 'first_50k', amount: 50000 },
        { key: 'first_25k', amount: 25000 },
        { key: 'first_10k', amount: 10000 },
      ];

      for (const milestone of milestoneThresholds) {
        if (totalRevenue >= milestone.amount) {
          currentMilestone = milestone.key;
          break;
        }
      }

      // Only show prompt if they haven't been prompted in the last 30 days
      if (currentMilestone) {
        const lastPrompt = detailer?.last_testimonial_prompt
          ? new Date(detailer.last_testimonial_prompt)
          : null;
        const daysSincePrompt = lastPrompt
          ? Math.floor((Date.now() - lastPrompt) / (1000 * 60 * 60 * 24))
          : 999;

        showPrompt = daysSincePrompt >= 30;
      }
    }

    return Response.json({
      testimonials: testimonials || [],
      hasGivenTestimonial: detailer?.testimonial_given || false,
      showPrompt,
      currentMilestone,
      totalRevenue,
    });

  } catch (err) {
    console.error('Testimonials GET error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Submit a testimonial
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

    const body = await request.json();
    const { rating, text, milestone } = body;

    if (!rating || rating < 1 || rating > 5) {
      return Response.json({ error: 'Rating must be 1-5' }, { status: 400 });
    }

    // Get current revenue
    const { data: quotes } = await supabase
      .from('quotes')
      .select('total_price, status')
      .eq('detailer_id', user.id)
      .in('status', ['paid', 'completed']);

    const totalRevenue = (quotes || []).reduce((sum, q) => sum + (q.total_price || 0), 0);

    // Create testimonial
    const { data: testimonial, error: testimonialError } = await supabase
      .from('testimonials')
      .insert({
        detailer_id: user.id,
        rating,
        text: text || null,
        milestone: milestone || null,
        revenue_at_time: totalRevenue,
      })
      .select()
      .single();

    if (testimonialError) throw testimonialError;

    // Mark detailer as having given testimonial
    await supabase
      .from('detailers')
      .update({
        testimonial_given: true,
        last_testimonial_prompt: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Award bonus points for testimonial
    const pointsAwarded = text ? 200 : 100; // More points for written testimonial

    await supabase
      .from('points_history')
      .insert({
        detailer_id: user.id,
        points: pointsAwarded,
        reason: 'testimonial',
        metadata: { testimonial_id: testimonial.id, has_text: !!text },
      });

    // Update detailer points
    const { data: detailer } = await supabase
      .from('detailers')
      .select('total_points, lifetime_points')
      .eq('id', user.id)
      .single();

    await supabase
      .from('detailers')
      .update({
        total_points: (detailer?.total_points || 0) + pointsAwarded,
        lifetime_points: (detailer?.lifetime_points || 0) + pointsAwarded,
      })
      .eq('id', user.id);

    return Response.json({
      success: true,
      testimonial,
      pointsAwarded,
    });

  } catch (err) {
    console.error('Testimonials POST error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// PATCH - Dismiss testimonial prompt (update last_testimonial_prompt)
export async function PATCH(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Update last prompt time to delay future prompts
    await supabase
      .from('detailers')
      .update({
        last_testimonial_prompt: new Date().toISOString(),
      })
      .eq('id', user.id);

    return Response.json({ success: true });

  } catch (err) {
    console.error('Testimonials PATCH error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
