import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Extract font names from a Google Fonts URL
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

// Common system/generic fonts to skip
const SKIP_FONTS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'sans-serif', 'serif', 'monospace',
  'cursive', 'fantasy', 'system-ui', '-apple-system', 'blinkmacsystemfont',
  'segoe ui', 'roboto', 'helvetica neue', 'arial', 'helvetica', 'noto sans',
  'liberation sans', 'apple color emoji', 'segoe ui emoji', 'segoe ui symbol',
  'noto color emoji', 'times new roman', 'times', 'courier new', 'courier',
  'verdana', 'georgia', 'tahoma', 'trebuchet ms', 'lucida console', 'lucida sans',
]);

function isCustomFont(name) {
  if (!name) return false;
  return !SKIP_FONTS.has(name.toLowerCase().trim());
}

/**
 * Clean a font name: strip quotes, take first in comma list
 */
function cleanFontName(raw) {
  if (!raw) return null;
  const firstName = raw.split(',')[0].trim().replace(/^['"]|['"]$/g, '').trim();
  if (!firstName || !isCustomFont(firstName)) return null;
  return firstName;
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

    const ffMatch = body.match(/font-family:\s*([^;]+)/i);
    if (!ffMatch) continue;

    const firstName = cleanFontName(ffMatch[1]);
    if (!firstName) continue;

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
 * Extract @font-face font names from CSS
 */
function extractFontFaceNames(cssText) {
  const names = [];
  const regex = /@font-face\s*\{[^}]*font-family:\s*['"]?([^;'"}\n]+)['"]?\s*;/gi;
  let m;
  while ((m = regex.exec(cssText)) !== null) {
    const name = m[1].trim().replace(/^['"]|['"]$/g, '').trim();
    if (name && isCustomFont(name)) names.push(name);
  }
  return [...new Set(names)];
}

/**
 * Extract CSS variable font declarations (Shopify, Squarespace, etc.)
 * Shopify themes use many patterns:
 *   --font-heading-family, --heading-font-family, --font-family-heading
 *   --font-body-family, --body-font-family, --text-font-family
 *   --heading-font-weight, --text-font-weight
 */
function extractCssVarFonts(cssText) {
  const result = { heading: null, body: null, headingWeight: null, bodyWeight: null };

  // Heading font patterns (Shopify uses --heading-font-family most commonly)
  const headingVarRegex = /--(?:font-heading-family|heading-font-family|heading-font(?!-weight|-style|-size)(?:-family)?|font-family-heading|typeface-heading|title-font-family)\s*:\s*([^;]+)/gi;
  let m;
  while ((m = headingVarRegex.exec(cssText)) !== null) {
    const name = cleanFontName(m[1]);
    if (name) { result.heading = name; break; }
  }

  // Body/text font patterns (Shopify uses --text-font-family)
  const bodyVarRegex = /--(?:font-body-family|body-font-family|body-font(?!-weight|-style|-size)(?:-family)?|text-font-family|font-family-body|font-family-text|typeface-body|content-font-family)\s*:\s*([^;]+)/gi;
  while ((m = bodyVarRegex.exec(cssText)) !== null) {
    const name = cleanFontName(m[1]);
    if (name) { result.body = name; break; }
  }

  // Font weights (useful metadata)
  const headingWeightRegex = /--(?:heading-font-weight|font-heading-weight)\s*:\s*(\d+)/gi;
  while ((m = headingWeightRegex.exec(cssText)) !== null) {
    result.headingWeight = m[1];
    break;
  }

  const bodyWeightRegex = /--(?:text-font-weight|body-font-weight|font-body-weight)\s*:\s*(\d+)/gi;
  while ((m = bodyWeightRegex.exec(cssText)) !== null) {
    result.bodyWeight = m[1];
    break;
  }

  return result;
}

/**
 * Extract Shopify-specific font data from HTML
 */
function extractShopifyFonts(html) {
  const result = { heading: null, body: null, fontUrls: [], isShopify: false };

  // Detect if site is Shopify
  if (/Shopify\.|shopify\.com|cdn\.shopify/i.test(html) || /\/cdn\/fonts\//i.test(html)) {
    result.isShopify = true;
  }

  // 1. Shopify CDN font links: fonts.shopifycdn.com
  const shopifyCdnRegex = /href=["'](https?:\/\/fonts\.shopifycdn\.com\/[^"']+)["']/gi;
  let m;
  while ((m = shopifyCdnRegex.exec(html)) !== null) {
    result.fontUrls.push(m[1]);
  }

  // 2. Shopify self-hosted CDN fonts: /cdn/fonts/fontname/fontname_n4.xxx.woff2
  // Extract font names from @font-face src URLs like //domain.com/cdn/fonts/poppins/poppins_n5.xxx.woff2
  const cdnFontRegex = /\/cdn\/fonts\/([a-z_-]+)\/\1[_a-z]*[ni]\d/gi;
  const cdnFontNames = new Set();
  while ((m = cdnFontRegex.exec(html)) !== null) {
    const raw = m[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    if (raw && isCustomFont(raw)) cdnFontNames.add(raw);
  }
  // If we found CDN font names, use them as fallback
  const cdnFonts = [...cdnFontNames];
  if (cdnFonts.length > 0 && !result.heading) result.heading = cdnFonts[0];
  if (cdnFonts.length > 1 && !result.body) result.body = cdnFonts[1];

  // 3. Shopify theme settings JSON in <script> tags
  // Look for patterns like: "type_header_font":"itc_caslon_no_224_n4"
  // or "heading_font":"Assistant" or "body_font":"Assistant"
  const settingsRegex = /["'](?:type_header_font|heading_font|type_heading_font)["']\s*:\s*["']([^"']+)["']/gi;
  while ((m = settingsRegex.exec(html)) !== null) {
    const raw = m[1].trim();
    // Shopify encodes font as "font_name_n4" or just "Font Name"
    const name = raw.replace(/_[ni]\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    if (name && isCustomFont(name)) result.heading = name;
  }

  const bodySettingsRegex = /["'](?:type_body_font|body_font|type_base_font)["']\s*:\s*["']([^"']+)["']/gi;
  while ((m = bodySettingsRegex.exec(html)) !== null) {
    const raw = m[1].trim();
    const name = raw.replace(/_[ni]\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    if (name && isCustomFont(name)) result.body = name;
  }

  // 4. Shopify Liquid settings in <script type="application/json"> tags
  const jsonScriptRegex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonScriptRegex.exec(html)) !== null) {
    const jsonStr = m[1];
    // Look for font references in the JSON
    const fontKeys = jsonStr.matchAll(/["'](?:type_header_font|heading_font|header_font|type_heading_font|heading_font_family)["']\s*:\s*["']([^"']+)["']/gi);
    for (const fk of fontKeys) {
      const raw = fk[1].trim();
      const name = raw.replace(/_[ni]\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
      if (name && isCustomFont(name) && !result.heading) result.heading = name;
    }
    const bodyFontKeys = jsonStr.matchAll(/["'](?:type_body_font|body_font|type_base_font|body_font_family|text_font)["']\s*:\s*["']([^"']+)["']/gi);
    for (const fk of bodyFontKeys) {
      const raw = fk[1].trim();
      const name = raw.replace(/_[ni]\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
      if (name && isCustomFont(name) && !result.body) result.body = name;
    }
  }

  // 5. Shopify global font family settings in meta or script
  const shopifyFontRegex = /font_family["']?\s*:\s*["']([^"']+)["']/gi;
  while ((m = shopifyFontRegex.exec(html)) !== null) {
    const name = cleanFontName(m[1]);
    if (name && !result.heading) result.heading = name;
  }

  return result;
}

/**
 * Extract brand colors from CSS text
 */
function extractColorsFromCss(cssText) {
  const colorCounts = {};

  function addColor(hex, weight) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const l = (r + g + b) / 3;
    const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15;
    if (l > 30 && l < 230 && !isGray) {
      colorCounts[hex] = (colorCounts[hex] || 0) + weight;
    }
  }

  // CSS custom properties (--primary, --accent, --brand-*, etc.)
  const varRegex = /--[\w-]*(primary|accent|brand|main|theme|highlight)[\w-]*\s*:\s*([^;]+)/gi;
  let vm;
  while ((vm = varRegex.exec(cssText)) !== null) {
    const val = vm[2].trim().toLowerCase();
    const hm = val.match(/#([0-9a-f]{3,8})\b/);
    if (hm) {
      let hex = hm[0];
      if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      if (hex.length === 7) addColor(hex, 5);
    }
  }

  // CSS rules
  const ruleRegex = /([^{}]+)\{([^}]+)\}/gi;
  let match;
  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selectors = match[1].toLowerCase().trim();
    const body = match[2];
    const isBrand = /\b(header|nav|button|btn|h[1-3]|a(?:\b|\.)|footer|hero|cta|accent|primary|brand|logo|banner)\b/i.test(selectors);
    const weight = isBrand ? 3 : 1;

    const colorProps = body.matchAll(/(background-color|(?<![a-z-])color|border-color)\s*:\s*([^;!]+)/gi);
    for (const cm of colorProps) {
      const value = cm[2].trim().toLowerCase();
      const hexMatch = value.match(/#([0-9a-f]{3,8})\b/);
      if (hexMatch) {
        let hex = hexMatch[0];
        if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        if (hex.length === 7) addColor(hex, weight);
      }
      const rgbMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]), g = parseInt(rgbMatch[2]), b = parseInt(rgbMatch[3]);
        const hex = '#' + [r, g, b].map(c_ => c_.toString(16).padStart(2, '0')).join('');
        addColor(hex, weight);
      }
    }
  }

  // Inline style hex colors
  const inlineHex = cssText.matchAll(/style="[^"]*(?:color|background)[^"]*?(#[0-9a-fA-F]{3,6})/gi);
  for (const im of inlineHex) {
    let hex = im[1].toLowerCase();
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    if (hex.length === 7) addColor(hex, 2);
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

  // All stylesheet <link> tags (both href-before-rel and rel-before-href)
  // Also capture Shopify's preloaded stylesheets: <link ... as="style" ...>
  const linkRegex = /<link[^>]+(?:rel=["']stylesheet["'][^>]+href=["']([^"']+)["']|href=["']([^"']+)["'][^>]+rel=["']stylesheet["'])/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = (m[1] || m[2]).replace(/&amp;/g, '&');
    if (!href.includes('fonts.googleapis.com') && !href.includes('use.typekit.net') && !stylesheetUrls.includes(href)) {
      stylesheetUrls.push(href);
    }
  }

  // Shopify also uses <link ... as="style"> for preloaded CSS
  const preloadStyleRegex = /<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]+as=["']style["']/gi;
  while ((m = preloadStyleRegex.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!stylesheetUrls.includes(href)) stylesheetUrls.push(href);
  }

  // Also find preload/preconnect font links (Shopify preloads fonts)
  const preloadRegex = /href=["']((?:https?:)?\/\/[^"']*(?:fonts\.|font|\/cdn\/fonts)[^"']+\.(?:css|woff2?|ttf|otf)[^"']*)["']/gi;
  while ((m = preloadRegex.exec(html)) !== null) {
    const href = m[1];
    if (href.includes('fonts.shopifycdn.com') || href.includes('fonts.googleapis.com')) {
      // Already handled above
    } else if (href.endsWith('.css') && !stylesheetUrls.includes(href)) {
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

    console.log(`[extract-fonts] Fetching: ${website_url}`);

    // Fetch the website with a realistic browser User-Agent
    let html;
    let fetchStatus;
    try {
      const res = await fetch(website_url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      fetchStatus = res.status;
      console.log(`[extract-fonts] Response status: ${res.status}, content-type: ${res.headers.get('content-type')}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      console.log(`[extract-fonts] HTML length: ${html.length}, first 500 chars: ${html.slice(0, 500).replace(/\n/g, ' ')}`);
    } catch (e) {
      console.log(`[extract-fonts] Fetch error: ${e.message}`);
      return Response.json({ error: `Could not fetch website: ${e.message}` }, { status: 400 });
    }

    const { googleFontUrls, adobeFontUrls, stylesheetUrls, inlineStyles } = parseHtml(html);
    console.log(`[extract-fonts] Found: ${googleFontUrls.length} Google Font URLs, ${adobeFontUrls.length} Adobe Font URLs, ${stylesheetUrls.length} stylesheets, ${inlineStyles.length} chars inline CSS`);
    if (stylesheetUrls.length > 0) console.log(`[extract-fonts] Stylesheet URLs: ${stylesheetUrls.slice(0, 5).join(', ')}`);

    // Shopify-specific detection (also searches inline styles + @font-face src paths)
    const shopifyFonts = extractShopifyFonts(html + '\n' + inlineStyles);
    console.log(`[extract-fonts] Shopify: isShopify=${shopifyFonts.isShopify}, heading=${shopifyFonts.heading}, body=${shopifyFonts.body}, cdn_urls=${shopifyFonts.fontUrls.length}`);

    // Collect all Google Font names
    const allGoogleFonts = [];
    for (const url of googleFontUrls) {
      allGoogleFonts.push(...parseFontNamesFromGoogleUrl(url));
    }
    console.log(`[extract-fonts] Google Fonts detected: ${allGoogleFonts.join(', ') || 'none'}`);

    // Fetch external stylesheets (limit to 8)
    let allCss = inlineStyles;
    const sheetsToFetch = stylesheetUrls.slice(0, 8);
    for (const url of sheetsToFetch) {
      try {
        const fullUrl = url.startsWith('http') ? url : new URL(url, website_url).href;
        const res = await fetch(fullUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000),
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

    // Also fetch Shopify CDN font CSS files
    for (const url of shopifyFonts.fontUrls.slice(0, 3)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) allCss += (await res.text()) + '\n';
      } catch (e) {}
    }

    // Also fetch Google Fonts CSS to get @font-face declarations
    for (const url of googleFontUrls.slice(0, 3)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) allCss += (await res.text()) + '\n';
      } catch (e) {}
    }

    console.log(`[extract-fonts] Total CSS collected: ${allCss.length} chars`);

    // Extract fonts from CSS by selector
    const cssFonts = extractFontsFromCss(allCss);

    // Extract CSS variable fonts (Shopify, Squarespace, etc.)
    const cssVarFonts = extractCssVarFonts(allCss + '\n' + html);
    console.log(`[extract-fonts] CSS selector fonts: heading=${cssFonts.heading}, body=${cssFonts.body}`);
    console.log(`[extract-fonts] CSS variable fonts: heading=${cssVarFonts.heading}, body=${cssVarFonts.body}`);

    // Extract @font-face declarations
    const fontFaceNames = extractFontFaceNames(allCss);
    console.log(`[extract-fonts] @font-face fonts: ${fontFaceNames.join(', ') || 'none'}`);

    // Extract brand colors from CSS + inline styles in HTML
    const cssColors = extractColorsFromCss(allCss + '\n' + html);

    // Determine final font assignments (priority order)
    // For Shopify sites, CSS variables are most reliable since themes use --heading-font-family / --text-font-family
    // 1. CSS variables (highest for Shopify)
    // 2. CSS selectors
    // 3. Shopify theme settings / CDN font paths
    // 4. @font-face declarations
    // 5. Google Fonts names
    let fontHeading, fontSubheading, fontBody;
    if (shopifyFonts.isShopify) {
      fontHeading = cssVarFonts.heading || cssFonts.heading || shopifyFonts.heading;
      fontSubheading = cssFonts.subheading;
      fontBody = cssVarFonts.body || cssFonts.body || shopifyFonts.body;
      console.log(`[extract-fonts] Shopify priority: heading=${fontHeading}, body=${fontBody}`);
    } else {
      fontHeading = cssFonts.heading || cssVarFonts.heading || shopifyFonts.heading;
      fontSubheading = cssFonts.subheading;
      fontBody = cssFonts.body || cssVarFonts.body || shopifyFonts.body;
    }

    // Fallback to @font-face names
    if (!fontHeading && fontFaceNames.length > 0) fontHeading = fontFaceNames[0];
    if (!fontBody && fontFaceNames.length > 1) fontBody = fontFaceNames[1];

    // Fallback to Google Fonts names
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
    for (const gf of allGoogleFonts) {
      if (!fontsForEmbed.includes(gf)) fontsForEmbed.push(gf);
    }
    // Add @font-face names that look like Google Fonts
    for (const ff of fontFaceNames) {
      if (!fontsForEmbed.includes(ff)) fontsForEmbed.push(ff);
    }
    const fontEmbedUrl = buildGoogleFontsUrl(fontsForEmbed);

    console.log(`[extract-fonts] Final: heading=${fontHeading}, subheading=${fontSubheading}, body=${fontBody}`);
    console.log(`[extract-fonts] Embed URL: ${fontEmbedUrl}`);

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
        console.log(`[extract-fonts] Stripping unknown column "${colMatch[1]}", retrying...`);
        delete updateFields[colMatch[1]];
        continue;
      }
      console.error('[extract-fonts] Save error:', error.message);
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
        shopify_fonts: (shopifyFonts.heading || shopifyFonts.body) ? true : false,
        font_face_names: fontFaceNames,
        css_var_fonts: cssVarFonts,
        stylesheets_parsed: sheetsToFetch.length,
        css_colors: cssColors.length,
      },
    });
  } catch (err) {
    console.error('[extract-fonts] Error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
