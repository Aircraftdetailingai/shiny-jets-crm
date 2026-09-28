import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { decodeHtmlEntities } from '@/lib/html-entities';

export const dynamic = 'force-dynamic';

// Extract meta tag content from HTML
function getMeta(html, property) {
  // Try property= first, then name=
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// Extract price from HTML using common patterns
function extractPrice(html) {
  // JSON-LD price
  const ldMatch = html.match(/"price"\s*:\s*"?([\d,.]+)"?/i);
  if (ldMatch) return parseFloat(ldMatch[1].replace(/,/g, ''));

  // Meta tag price
  const metaPrice = getMeta(html, 'product:price:amount') || getMeta(html, 'og:price:amount');
  if (metaPrice) return parseFloat(metaPrice.replace(/,/g, ''));

  // Common price patterns in HTML
  const pricePatterns = [
    /class="[^"]*price[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/i,
    /data-price="([\d,.]+)"/i,
    /itemprop="price"\s+content="([\d,.]+)"/i,
    /itemprop="price"[^>]*>\s*\$?([\d,]+\.?\d*)/i,
  ];
  for (const p of pricePatterns) {
    const m = html.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return null;
}

// Extract brand from HTML
function extractBrand(html) {
  // JSON-LD brand
  const ldMatch = html.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)
    || html.match(/"brand"\s*:\s*"([^"]+)"/i);
  if (ldMatch) return ldMatch[1].trim();

  const metaBrand = getMeta(html, 'product:brand') || getMeta(html, 'og:brand');
  if (metaBrand) return metaBrand;

  // itemprop brand
  const itemMatch = html.match(/itemprop="brand"[^>]*content="([^"]+)"/i)
    || html.match(/itemprop="brand"[^>]*>\s*([^<]+)</i);
  if (itemMatch) return itemMatch[1].trim();

  return null;
}

// Extract model/MPN
function extractModel(html) {
  const ldMatch = html.match(/"mpn"\s*:\s*"([^"]+)"/i)
    || html.match(/"model"\s*:\s*"([^"]+)"/i)
    || html.match(/"sku"\s*:\s*"([^"]+)"/i);
  if (ldMatch) return ldMatch[1].trim();

  const metaModel = getMeta(html, 'product:model');
  if (metaModel) return metaModel;

  const itemMatch = html.match(/itemprop="model"[^>]*content="([^"]+)"/i)
    || html.match(/itemprop="mpn"[^>]*content="([^"]+)"/i);
  if (itemMatch) return itemMatch[1].trim();

  return null;
}

// Site-specific extractors
const SITE_EXTRACTORS = {
  amazon: (html, url) => {
    const title = getMeta(html, 'og:title')
      || html.match(/<span[^>]+id="productTitle"[^>]*>\s*([^<]+)/i)?.[1]?.trim();

    const image = getMeta(html, 'og:image')
      || html.match(/"hiRes"\s*:\s*"([^"]+)"/)?.[1]
      || html.match(/"large"\s*:\s*"([^"]+)"/)?.[1];

    let price = extractPrice(html);
    if (!price) {
      const priceMatch = html.match(/class="a-price-whole"[^>]*>([\d,]+)/i);
      const fracMatch = html.match(/class="a-price-fraction"[^>]*>(\d+)/i);
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(/,/g, '') + '.' + (fracMatch?.[1] || '00'));
      }
    }

    const brand = extractBrand(html)
      || html.match(/id="bylineInfo"[^>]*>[^<]*(?:Brand:|Visit the|Visit)\s*([^<]+)/i)?.[1]?.trim();

    return { name: title, price, image, brand, model: extractModel(html) };
  },

  homedepot: (html) => {
    const title = getMeta(html, 'og:title')
      || html.match(/<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html)
      || getMeta(html, 'og:title')?.split(' ')[0];
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  grainger: (html) => {
    const title = getMeta(html, 'og:title');
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  detailking: (html) => {
    const title = getMeta(html, 'og:title')
      || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  rupes: (html) => {
    const title = getMeta(html, 'og:title')
      || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    return { name: title, price, image, brand: 'Rupes', model: extractModel(html) };
  },

  autogeek: (html) => {
    const title = getMeta(html, 'og:title')
      || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  flyshiny: (html) => {
    const title = getMeta(html, 'og:title') || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html) || 'Fly Shiny';
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  realcleanaviation: (html) => {
    const title = getMeta(html, 'og:title') || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html) || 'Real Clean Aviation';
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  skygeek: (html) => {
    const title = getMeta(html, 'og:title') || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  aircraftspruce: (html) => {
    const title = getMeta(html, 'og:title') || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  chiefaircraft: (html) => {
    const title = getMeta(html, 'og:title') || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },

  nuvite: (html) => {
    const title = getMeta(html, 'og:title') || html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image');
    const price = extractPrice(html);
    return { name: title, price, image, brand: 'Nuvite', model: extractModel(html) };
  },

  generic: (html) => {
    const title = getMeta(html, 'og:title')
      || getMeta(html, 'twitter:title')
      || html.match(/<title>([^<]+)/i)?.[1]?.trim();
    const image = getMeta(html, 'og:image') || getMeta(html, 'twitter:image');
    const price = extractPrice(html);
    const brand = extractBrand(html);
    return { name: title, price, image, brand, model: extractModel(html) };
  },
};

function detectSite(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes('amazon')) return 'amazon';
  if (hostname.includes('homedepot')) return 'homedepot';
  if (hostname.includes('grainger')) return 'grainger';
  if (hostname.includes('detailking')) return 'detailking';
  if (hostname.includes('rupes')) return 'rupes';
  if (hostname.includes('autogeek')) return 'autogeek';
  if (hostname.includes('flyshiny')) return 'flyshiny';
  if (hostname.includes('realcleanaviation')) return 'realcleanaviation';
  if (hostname.includes('skygeek')) return 'skygeek';
  if (hostname.includes('aircraftspruce')) return 'aircraftspruce';
  if (hostname.includes('chiefaircraft')) return 'chiefaircraft';
  if (hostname.includes('nuvite')) return 'nuvite';
  return 'generic';
}

// Clean up extracted name
function cleanName(name) {
  if (!name) return null;
  // Decode entities first (&amp; &#39; &#x27; …), then remove site suffixes
  return decodeHtmlEntities(name)
    .replace(/\s*[-|]\s*(Amazon\.com|Home Depot|Grainger|Detail King|Rupes|Autogeek|Fly Shiny|Real Clean Aviation|Skygeek|Aircraft Spruce|Chief Aircraft|Nuvite).*$/i, '')
    .replace(/\s*[-|]\s*The Home Depot.*$/i, '')
    .trim();
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const planGate = await requireFeature(request, 'equipment', { user: user });
    if (planGate) return planGate;

    const body = await request.json();
    const { url } = body;

    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 });

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Fetch the page
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return Response.json({ error: `Failed to fetch page (${response.status})` }, { status: 422 });
    }

    const html = await response.text();
    const site = detectSite(url);
    const extractor = SITE_EXTRACTORS[site] || SITE_EXTRACTORS.generic;
    const result = extractor(html, url);

    // Clean up
    const product = {
      name: cleanName(result.name) || null,
      brand: result.brand || null,
      model: result.model || null,
      price: result.price || null,
      image_url: result.image || null,
      product_url: url,
      source: site,
    };

    return Response.json({ product });
  } catch (err) {
    console.error('Equipment scrape error:', err);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return Response.json({ error: 'Request timed out - try again' }, { status: 408 });
    }
    return Response.json({ error: 'Failed to extract product info' }, { status: 500 });
  }
}
