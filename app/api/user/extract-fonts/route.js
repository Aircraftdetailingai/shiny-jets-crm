import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

/**
 * Extract font names from a Google Fonts URL
 * e.g. "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Open+Sans:wght@300;400&display=swap"
 * → ["Montserrat", "Open Sans"]
 */
function parseFontNamesFromGoogleUrl(url) {
  const fonts = [];
  const familyMatches = url.matchAll(/family=([^&:]+)/g);
  for (const m of familyMatches) {
    fonts.push(decodeURIComponent(m[1]).replace(/\+/g, ' '));
  }
  return fonts;
}

/**
 * Build a combined Google Fonts embed URL from font names
 */
function buildGoogleFontsUrl(fontNames) {
  if (!fontNames.length) return null;
  const families = [...new Set(fontNames)].map(name =>
    `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@300;400;500;600;700`
  );
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/**
 * Extract font-family values from CSS text, grouped by selector type
 */
function extractFontsFromCss(cssText) {
  const result = { heading: null, subheading: null, body: null };

  // Match CSS rules: selector { ... font-family: value; ... }
  const ruleRegex = /([^{}]+)\{([^}]*font-family[^}]*)\}/gi;
  let match;

  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selectors = match[1].toLowerCase().trim();
    const body = match[2];

    // Extract font-family value
    const ffMatch = body.match(/font-family:\s*([^;]+)/i);
    if (!ffMatch) continue;

    // Clean the font name: take first in comma list, strip quotes
    const rawValue = ffMatch[1].trim();
    const firstName = rawValue.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (!firstName || firstName === 'inherit' || firstName === 'initial') continue;

    // Classify by selector
    if (/\bh1\b|\bh2\b|\bh3\b/.test(selectors)) {
      if (!result.heading) result.heading = firstName;
    }
    if (/\bh4\b|\bh5\b|\bh6\b/.test(selectors)) {
      if (!result.subheading) result.subheading = firstName;
    }
    if (/\bbody\b|\bp\b|\bmain\b|\.content|\.text/.test(selectors)) {
      if (!result.body) result.body = firstName;
    }
  }

  return result;
}

/**
 * Extract brand colors from CSS text
 */
function extractColorsFromCss(cssText) {
  const colorCounts = {};
  const ruleRegex = /([^{}]+)\{([^}]+)\}/gi;
  let match;

  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selectors = match[1].toLowerCase().trim();
    const body = match[2];

    // Only look at selectors likely to contain brand colors
    if (!/\b(header|nav|button|btn|h1|h2|h3|a|footer|hero|cta|accent|primary|brand)\b/i.test(selectors)) continue;

    const colorProps = body.matchAll(/(background-color|(?<![a-z-])color|border-color|background)\s*:\s*([^;]+)/gi);
    for (const cm of colorProps) {
      const value = cm[2].trim().toLowerCase();
      // Match hex colors
      const hexMatch = value.match(/#([0-9a-f]{3,8})\b/);
      if (hexMatch) {
        let hex = hexMatch[0];
        if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        if (hex.length === 7) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const l = (r + g + b) / 3;
          const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15;
          if (l > 30 && l < 230 && !isGray) {
            colorCounts[hex] = (colorCounts[hex] || 0) + 1;
          }
        }
      }
      // Match rgb/rgba
      const rgbMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]), g = parseInt(rgbMatch[2]), b = parseInt(rgbMatch[3]);
        const l = (r + g + b) / 3;
        const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15;
        if (l > 30 && l < 230 && !isGray) {
          const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }
      }
    }
  }

  return Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);
}

/**
 * Extract all stylesheet URLs and inline styles from HTML
 */
function parseHtml(html) {
  const googleFontUrls = [];
  const adobeFontUrls = [];
  const stylesheetUrls = [];
  let inlineStyles = '';

  // Google Fonts <link> tags
  const gfRegex = /href=["'](https?:\/\/fonts\.googleapis\.com\/css2?\?[^"']+)["']/gi;
  let m;
  while ((m = gfRegex.exec(html)) !== null) {
    googleFontUrls.push(m[1].replace(/&amp;/g, '&'));
  }

  // Adobe Fonts / Typekit
  const tkRegex = /href=["'](https?:\/\/use\.typekit\.net\/[^"']+)["']/gi;
  while ((m = tkRegex.exec(html)) !== null) {
    adobeFontUrls.push(m[1]);
  }

  // Other stylesheet <link> tags
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!href.includes('fonts.googleapis.com') && !href.includes('use.typekit.net')) {
      stylesheetUrls.push(href);
    }
  }
  // Also match href before rel
  const linkRegex2 = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/gi;
  while ((m = linkRegex2.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!href.includes('fonts.googleapis.com') && !href.includes('use.typekit.net') && !stylesheetUrls.includes(href)) {
      stylesheetUrls.push(href);
    }
  }

  // Inline <style> blocks
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRegex.exec(html)) !== null) {
    inlineStyles += m[1] + '\n';
  }

  // CSS @import in inline styles
  const importRegex = /@import\s+url\(["']?(https?:\/\/fonts\.googleapis\.com\/[^"')]+)["']?\)/gi;
  while ((m = importRegex.exec(inlineStyles)) !== null) {
    googleFontUrls.push(m[1]);
  }

  return { googleFontUrls, adobeFontUrls, stylesheetUrls, inlineStyles };
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { website_url } = await request.json();
    if (!website_url || !/^https?:\/\/.+/.test(website_url)) {
      return Response.json({ error: 'Invalid URL. Must start with http:// or https://' }, { status: 400 });
    }

    // Fetch the website
    let html;
    try {
      const res = await fetch(website_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VectorBot/1.0)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (e) {
      return Response.json({ error: `Could not fetch website: ${e.message}` }, { status: 400 });
    }

    const { googleFontUrls, adobeFontUrls, stylesheetUrls, inlineStyles } = parseHtml(html);

    // Collect all Google Font names
    const allGoogleFonts = [];
    for (const url of googleFontUrls) {
      allGoogleFonts.push(...parseFontNamesFromGoogleUrl(url));
    }

    // Fetch external stylesheets (limit to 5)
    let allCss = inlineStyles;
    const sheetsToFetch = stylesheetUrls.slice(0, 5);
    for (const url of sheetsToFetch) {
      try {
        const fullUrl = url.startsWith('http') ? url : new URL(url, website_url).href;
        const res = await fetch(fullUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VectorBot/1.0)' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const css = await res.text();
          allCss += css + '\n';
          // Check for Google Fonts @import in CSS
          const importMatch = css.matchAll(/@import\s+url\(["']?(https?:\/\/fonts\.googleapis\.com\/[^"')]+)["']?\)/gi);
          for (const im of importMatch) {
            allGoogleFonts.push(...parseFontNamesFromGoogleUrl(im[1]));
          }
        }
      } catch (e) {
        // Skip failed fetches
      }
    }

    // Also fetch Google Fonts CSS to get @font-face declarations (which may reveal font names in selectors)
    for (const url of googleFontUrls.slice(0, 3)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VectorBot/1.0)' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) allCss += (await res.text()) + '\n';
      } catch (e) {}
    }

    // Extract fonts from CSS by selector
    const cssFonts = extractFontsFromCss(allCss);

    // Extract brand colors from CSS
    const cssColors = extractColorsFromCss(allCss);

    // Determine final font assignments
    let fontHeading = cssFonts.heading;
    let fontSubheading = cssFonts.subheading;
    let fontBody = cssFonts.body;

    // Fallback: use Google Fonts names if CSS parsing didn't find specific selectors
    if (allGoogleFonts.length > 0) {
      const uniqueGoogleFonts = [...new Set(allGoogleFonts)];
      if (!fontHeading && uniqueGoogleFonts[0]) fontHeading = uniqueGoogleFonts[0];
      if (!fontBody && uniqueGoogleFonts.length > 1) fontBody = uniqueGoogleFonts[1];
      if (!fontBody && uniqueGoogleFonts[0]) fontBody = uniqueGoogleFonts[0];
    }

    // If subheading not found, fall back to heading
    if (!fontSubheading && fontHeading) fontSubheading = fontHeading;

    // Build embed URL
    const fontsForEmbed = [fontHeading, fontSubheading, fontBody].filter(Boolean);
    // Also include any Google Fonts that were detected
    for (const gf of allGoogleFonts) {
      if (!fontsForEmbed.includes(gf)) fontsForEmbed.push(gf);
    }
    const fontEmbedUrl = buildGoogleFontsUrl(fontsForEmbed);

    // Merge CSS colors with existing logo-extracted colors
    const supabase = getSupabase();
    let mergedColors = cssColors;
    try {
      const { data: existing } = await supabase
        .from('detailers')
        .select('theme_colors')
        .eq('id', user.id)
        .single();
      const existingColors = existing?.theme_colors || [];
      mergedColors = [...new Set([...existingColors, ...cssColors])].slice(0, 10);
    } catch (e) {}

    // Save to database with column-stripping retry
    let updateFields = {
      website_url,
      font_heading: fontHeading || null,
      font_subheading: fontSubheading || null,
      font_body: fontBody || null,
      font_embed_url: fontEmbedUrl || null,
      theme_colors: mergedColors,
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase
        .from('detailers')
        .update(updateFields)
        .eq('id', user.id);

      if (!error) break;

      const colMatch = error.message?.match(/column "([^"]+)" of relation "detailers" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'detailers'/);
      if (colMatch) {
        console.log(`extract-fonts: stripping unknown column "${colMatch[1]}", retrying...`);
        delete updateFields[colMatch[1]];
        continue;
      }
      console.error('extract-fonts save error:', error.message);
      break;
    }

    return Response.json({
      success: true,
      fonts: {
        heading: fontHeading || null,
        subheading: fontSubheading || null,
        body: fontBody || null,
        embed_url: fontEmbedUrl || null,
      },
      colors: cssColors,
      detected: {
        google_fonts: allGoogleFonts.length,
        adobe_fonts: adobeFontUrls.length,
        stylesheets_parsed: sheetsToFetch.length,
        css_colors: cssColors.length,
      },
    });
  } catch (err) {
    console.error('extract-fonts error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
