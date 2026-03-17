import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('detailers')
      .select('logo_url, theme_primary, theme_accent, theme_bg, theme_surface, theme_logo_url, website_url, font_heading, font_subheading, font_body, font_embed_url')
      .eq('id', user.id)
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      logo_url: data?.logo_url || null,
      theme_primary: data?.theme_primary || '#C9A84C',
      theme_accent: data?.theme_accent || '#0D1B2A',
      theme_bg: data?.theme_bg || '#0A0E17',
      theme_surface: data?.theme_surface || '#111827',
      theme_logo_url: data?.theme_logo_url || null,
      website_url: data?.website_url || null,
      font_heading: data?.font_heading || null,
      font_subheading: data?.font_subheading || null,
      font_body: data?.font_body || null,
      font_embed_url: data?.font_embed_url || null,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const updates = {};

    if (body.theme_primary !== undefined) {
      if (!HEX_RE.test(body.theme_primary)) return Response.json({ error: 'Invalid theme_primary hex' }, { status: 400 });
      updates.theme_primary = body.theme_primary;
    }
    if (body.theme_accent !== undefined) {
      if (!HEX_RE.test(body.theme_accent)) return Response.json({ error: 'Invalid theme_accent hex' }, { status: 400 });
      updates.theme_accent = body.theme_accent;
    }
    if (body.theme_bg !== undefined) {
      if (!HEX_RE.test(body.theme_bg)) return Response.json({ error: 'Invalid theme_bg hex' }, { status: 400 });
      updates.theme_bg = body.theme_bg;
    }
    if (body.theme_surface !== undefined) {
      if (!HEX_RE.test(body.theme_surface)) return Response.json({ error: 'Invalid theme_surface hex' }, { status: 400 });
      updates.theme_surface = body.theme_surface;
    }
    if (body.theme_logo_url !== undefined) {
      updates.theme_logo_url = body.theme_logo_url;
    }
    if (body.website_url !== undefined) {
      if (body.website_url && !/^https?:\/\/.+/.test(body.website_url)) {
        return Response.json({ error: 'Invalid website URL' }, { status: 400 });
      }
      updates.website_url = body.website_url || null;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('detailers')
      .update(updates)
      .eq('id', user.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
