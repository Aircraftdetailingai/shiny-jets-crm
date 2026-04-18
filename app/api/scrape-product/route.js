import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Extract meta tag content from HTML
function getMeta(html, property) {
  // Try property= (og:, product:)
  const propMatch = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
  if (propMatch) return propMatch[1];

  // Try name=
  const nameMatch = html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'));
  if (nameMatch) return nameMatch[1];

  return null;
}

// Extract JSON-LD product data
function getJsonLd(html) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    try {
      const content = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      const data = JSON.parse(content);
      // Could be array or single object
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
          return item;
        }
        // Check @graph
        if (item['@graph']) {
          for (const g of item['@graph']) {
            if (g['@type'] === 'Product' || g['@type']?.includes?.('Product')) {
              return g;
            }
          }
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }
  return null;
}

// Extract price from various formats
function extractPrice(html, jsonLd) {
  // Try JSON-LD first
  if (jsonLd?.offers) {
    const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
    if (offers?.price) return parseFloat(offers.price);
    if (offers?.lowPrice) return parseFloat(offers.lowPrice);
  }

  // Try og:price meta
  const ogPrice = getMeta(html, 'og:price:amount') || getMeta(html, 'product:price:amount');
  if (ogPrice) return parseFloat(ogPrice);

  // Try common price patterns in HTML
  const pricePatterns = [
    /class=["'][^"']*price[^"']*["'][^>]*>\s*\$?([\d,]+\.?\d*)/i,
    /id=["'][^"']*price[^"']*["'][^>]*>\s*\$?([\d,]+\.?\d*)/i,
    /itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i,
    /data-price=["']([\d.]+)["']/i,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val > 0 && val < 100000) return val;
    }
  }

  return null;
}

// Detect supplier/brand from URL
function detectSite(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes('detailking')) return 'Detail King';
  if (hostname.includes('autogeek')) return 'Autogeek';
  if (hostname.includes('amazon')) return 'Amazon';
  if (hostname.includes('chemicalguys')) return 'Chemical Guys';
  if (hostname.includes('rupesusa') || hostname.includes('rupes.com')) return 'Rupes';
  if (hostname.includes('psdetail') || hostname.includes('pandsdirect')) return 'P&S';
  if (hostname.includes('iglcoatings')) return 'IGL Coatings';
  if (hostname.includes('gtechniq')) return 'Gtechniq';
  if (hostname.includes('homedepot')) return 'Home Depot';
  if (hostname.includes('grainger')) return 'Grainger';
  if (hostname.includes('flex-tools') || hostname.includes('flexpowertools')) return 'Flex';
  if (hostname.includes('lowes')) return "Lowe's";
  if (hostname.includes('harborfreight')) return 'Harbor Freight';
  if (hostname.includes('griotsgarage') || hostname.includes('griotsgarage')) return "Griot's Garage";
  if (hostname.includes('collinite')) return 'Collinite';
  if (hostname.includes('meguiars')) return "Meguiar's";
  if (hostname.includes('3m')) return '3M';
  if (hostname.includes('sonax')) return 'Sonax';
  if (hostname.includes('carpro')) return 'CarPro';
  if (hostname.includes('koch-chemie')) return 'Koch-Chemie';
  // Aviation suppliers
  if (hostname.includes('flyshiny')) return 'Fly Shiny';
  if (hostname.includes('realcleanaviation')) return 'Real Clean Aviation';
  if (hostname.includes('skygeek')) return 'Skygeek';
  if (hostname.includes('aircraftspruce')) return 'Aircraft Spruce';
  if (hostname.includes('chiefaircraft')) return 'Chief Aircraft';
  if (hostname.includes('nuvitechemical') || hostname.includes('nuvite')) return 'Nuvite';
  return null;
}

// Extract brand from product name or HTML
function extractBrand(name, html, jsonLd, siteDetected) {
  // JSON-LD brand
  if (jsonLd?.brand) {
    const b = typeof jsonLd.brand === 'string' ? jsonLd.brand : jsonLd.brand?.name;
    if (b) return b;
  }

  // Meta tag
  const metaBrand = getMeta(html, 'og:brand') || getMeta(html, 'product:brand');
  if (metaBrand) return metaBrand;

  // Site-detected brand
  if (siteDetected && ['Chemical Guys', 'Rupes', 'P&S', 'IGL Coatings', 'Gtechniq', 'Flex',
    "Griot's Garage", 'Collinite', "Meguiar's", '3M', 'Sonax', 'CarPro', 'Koch-Chemie',
    'Fly Shiny', 'Real Clean Aviation', 'Nuvite'].includes(siteDetected)) {
    return siteDetected;
  }

  // Try to extract from product name (common brand prefixes)
  const knownBrands = [
    "Meguiar's", 'Meguiars', 'Chemical Guys', 'Rupes', 'P&S', 'IGL', 'Gtechniq',
    'Collinite', 'Sonax', 'CarPro', 'Koch-Chemie', "Griot's", 'Adam\'s', '3M',
    'Flex', 'Milwaukee', 'DeWalt', 'Makita', 'Bosch', 'Karcher', 'Sun Joe',
    'Greenworks', 'Rigid', 'Ryobi', 'Craftsman',
    'Nuvite', 'Fly Shiny', 'Real Clean', 'Pratt & Whitney', 'Zip-Chem', 'Aero-Sense',
  ];
  if (name) {
    for (const brand of knownBrands) {
      if (name.toLowerCase().startsWith(brand.toLowerCase())) {
        return brand;
      }
    }
  }

  return null;
}

// Try to detect size/volume from name
function extractSize(name, html) {
  if (!name) return null;
  // Common patterns: "32 oz", "1 gallon", "500ml", "16oz", "128 fl oz"
  const sizePatterns = [
    /(\d+(?:\.\d+)?\s*(?:fl\.?\s*)?oz)/i,
    /(\d+(?:\.\d+)?\s*ml)/i,
    /(\d+(?:\.\d+)?\s*(?:liter|litre|lt?)s?)/i,
    /(\d+(?:\.\d+)?\s*gal(?:lon)?s?)/i,
    /(\d+(?:\.\d+)?\s*(?:qt|quart)s?)/i,
    /(\d+(?:\.\d+)?\s*(?:pt|pint)s?)/i,
    /(\d+(?:\.\d+)?\s*(?:cc))/i,
    /(\d+(?:\.\d+)?\s*(?:inch|in|ft|foot|feet|mm|cm|m)\b)/i,
  ];

  for (const pattern of sizePatterns) {
    const match = name.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

// Detect product category from name/description
function detectCategory(name, description) {
  const text = `${name || ''} ${description || ''}`.toLowerCase();

  if (/compound|cutting\s*compound|heavy\s*cut/i.test(text)) return 'compound';
  if (/polish|finishing\s*polish|fine\s*cut/i.test(text)) return 'polish';
  if (/wax|carnauba|paste\s*wax/i.test(text)) return 'wax';
  if (/ceramic|coating|sealant|graphene/i.test(text)) return 'ceramic';
  if (/clean(er|ing)|all\s*purpose|apc|wash/i.test(text)) return 'cleaner';
  if (/degrease|degreaser|tar\s*remov/i.test(text)) return 'degreaser';
  if (/brightwork|metal\s*polish|aluminum|chrome/i.test(text)) return 'brightwork';
  if (/leather|vinyl|interior/i.test(text)) return 'leather';
  if (/towel|cloth|microfiber|chamois/i.test(text)) return 'towels';
  if (/applicator|pad|foam\s*pad|backing\s*plate/i.test(text)) return 'applicators';

  return null;
}

// Detect equipment category from name
function detectEquipmentCategory(name) {
  const text = (name || '').toLowerCase();

  if (/polish(er|ing)|rotary|da\b|dual\s*action|orbital|random\s*orbit/i.test(text)) return 'polisher';
  if (/extract(or|ion)|carpet/i.test(text)) return 'extractor';
  if (/pressure\s*wash|power\s*wash|spray(er)?/i.test(text)) return 'pressure_washer';
  if (/vacuum|vac\b|shop\s*vac/i.test(text)) return 'vacuum';
  if (/steam(er|ing)/i.test(text)) return 'steamer';
  if (/light|led|lamp|flood|spot/i.test(text)) return 'lighting';
  if (/lift|ladder|scaffold|step|platform/i.test(text)) return 'lift';
  if (/generator|inverter|power\s*station/i.test(text)) return 'generator';
  if (/compressor|air\s*tank/i.test(text)) return 'compressor';

  return null;
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { url, type } = body; // type: 'product' or 'equipment'

  if (!url) {
    return Response.json({ error: 'URL is required' }, { status: 400 });
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return Response.json({ error: `Failed to fetch page (${response.status})` }, { status: 422 });
    }

    const html = await response.text();
    const siteDetected = detectSite(url);

    // Extract JSON-LD structured data
    const jsonLd = getJsonLd(html);

    // Extract product name
    let name = jsonLd?.name
      || getMeta(html, 'og:title')
      || getMeta(html, 'twitter:title');

    // Fallback to <title> tag
    if (!name) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      name = titleMatch ? titleMatch[1].trim() : null;
    }

    // Clean up name - remove site suffix
    if (name) {
      name = name
        .replace(/\s*[\|\-\u2013\u2014]\s*(Detail King|Autogeek|Amazon\.com|Chemical Guys|Home Depot|Grainger|Lowe's|Fly Shiny|Real Clean Aviation|Skygeek|Aircraft Spruce|Chief Aircraft|Nuvite).*$/i, '')
        .replace(/\s*:\s*Amazon\.com.*$/i, '')
        .trim();
    }

    // Extract description
    const description = jsonLd?.description
      || getMeta(html, 'og:description')
      || getMeta(html, 'description')
      || '';

    // Extract image
    let imageUrl = null;
    if (jsonLd?.image) {
      imageUrl = Array.isArray(jsonLd.image) ? jsonLd.image[0] : (typeof jsonLd.image === 'string' ? jsonLd.image : jsonLd.image?.url);
    }
    if (!imageUrl) {
      imageUrl = getMeta(html, 'og:image') || getMeta(html, 'twitter:image');
    }
    // Make absolute URL if relative
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = new URL(imageUrl, url).href;
    }

    // Extract price
    const price = extractPrice(html, jsonLd);

    // Extract brand
    const brand = extractBrand(name, html, jsonLd, siteDetected);

    // Extract size
    const size = extractSize(name || '', html);

    // Detect supplier
    const supplier = siteDetected || parsedUrl.hostname.replace('www.', '');

    // Build result based on type
    const result = {
      name: name || '',
      brand: brand || '',
      price: price || null,
      imageUrl: imageUrl || null,
      productUrl: url,
      supplier: supplier,
    };

    if (type === 'equipment') {
      result.category = detectEquipmentCategory(name) || null;
      // Try to split brand/model from name
      if (brand && name && name.toLowerCase().startsWith(brand.toLowerCase())) {
        result.model = name.substring(brand.length).trim().replace(/^[-\s]+/, '');
      }
    } else {
      result.size = size || '';
      result.category = detectCategory(name, description) || null;
    }

    return Response.json(result);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return Response.json({ error: 'Request timed out. The site may be blocking automated requests.' }, { status: 422 });
    }
    console.error('Scrape error:', err.message);
    return Response.json({ error: 'Failed to extract product info. Try entering details manually.' }, { status: 422 });
  }
}
