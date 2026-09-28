import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

// Extract product info from a URL by fetching and parsing HTML
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const planGate = await requireFeature(request, 'products', { user: user });
  if (planGate) return planGate;

  const body = await request.json();
  const { url } = body;

  if (!url) {
    return Response.json({ error: 'URL required' }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace('www.', '');

    // Fetch page HTML
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return Response.json({ error: `Failed to fetch URL (${res.status})` }, { status: 400 });
    }

    const html = await res.text();

    // Extract data using multiple strategies
    const result = {
      name: '',
      brand: '',
      price: null,
      size: '',
      image: '',
      category: 'other',
      supplier: '',
    };

    // Detect supplier from hostname
    const supplierMap = {
      'detailking.com': 'Detail King',
      'autogeek.com': 'Autogeek',
      'autogeek.net': 'Autogeek',
      'amazon.com': 'Amazon',
      'chemicalguys.com': 'Chemical Guys',
      'psdetail.com': 'P&S Detail Products',
      'pfrproducts.com': 'P&S Detail Products',
      'flyshiny.com': 'Fly Shiny',
      'realcleanaviation.com': 'Real Clean Aviation',
      'skygeek.com': 'Skygeek',
      'aircraftspruce.com': 'Aircraft Spruce',
      'chiefaircraft.com': 'Chief Aircraft',
      'nuvitechemical.com': 'Nuvite',
    };
    result.supplier = supplierMap[hostname] || hostname;

    // 1. Try JSON-LD structured data (most reliable)
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
          const data = JSON.parse(jsonStr);
          const product = data['@type'] === 'Product' ? data
            : Array.isArray(data['@graph']) ? data['@graph'].find(g => g['@type'] === 'Product')
            : null;

          if (product) {
            if (product.name) result.name = cleanText(product.name);
            if (product.brand?.name) result.brand = cleanText(product.brand.name);
            else if (typeof product.brand === 'string') result.brand = cleanText(product.brand);
            if (product.image) {
              const img = Array.isArray(product.image) ? product.image[0] : product.image;
              result.image = typeof img === 'string' ? img : img?.url || '';
            }
            if (product.offers) {
              const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
              if (offer?.price) result.price = parseFloat(offer.price);
            }
          }
        } catch {}
      }
    }

    // 2. OpenGraph / meta tags fallback
    if (!result.name) {
      result.name = cleanText(extractMeta(html, 'og:title') || extractMeta(html, 'title') || extractTag(html, 'title'));
    }
    if (!result.image) {
      result.image = extractMeta(html, 'og:image') || '';
    }
    if (!result.price) {
      const priceStr = extractMeta(html, 'product:price:amount') || extractMeta(html, 'og:price:amount');
      if (priceStr) result.price = parseFloat(priceStr);
    }

    // 3. Site-specific extraction
    if (hostname.includes('amazon.com')) {
      extractAmazon(html, result);
    } else if (hostname.includes('chemicalguys.com')) {
      extractChemicalGuys(html, result);
    } else if (hostname.includes('detailking.com')) {
      extractDetailKing(html, result);
    } else if (hostname.includes('autogeek')) {
      extractAutogeek(html, result);
    } else if (hostname.includes('flyshiny')) {
      extractAviationSupplier(html, result, 'Fly Shiny');
    } else if (hostname.includes('realcleanaviation')) {
      extractAviationSupplier(html, result, 'Real Clean Aviation');
    } else if (hostname.includes('skygeek')) {
      extractAviationSupplier(html, result, 'Skygeek');
    } else if (hostname.includes('aircraftspruce')) {
      extractAviationSupplier(html, result, 'Aircraft Spruce');
    } else if (hostname.includes('chiefaircraft')) {
      extractAviationSupplier(html, result, 'Chief Aircraft');
    } else if (hostname.includes('nuvite')) {
      extractAviationSupplier(html, result, 'Nuvite');
    }

    // 4. Generic price fallback
    if (!result.price) {
      const priceMatch = html.match(/class=["'][^"']*price[^"']*["'][^>]*>\s*\$?([\d,.]+)/i);
      if (priceMatch) result.price = parseFloat(priceMatch[1].replace(',', ''));
    }

    // 5. Try to extract size from product name
    if (!result.size && result.name) {
      result.size = extractSize(result.name);
    }

    // 6. Try to extract brand from name if missing
    if (!result.brand && result.name) {
      result.brand = guessCategory(result.name).brand;
    }

    // 7. Auto-detect category
    result.category = guessCategory(result.name + ' ' + (result.brand || '')).category;

    // Clean up name - remove brand prefix if it's duplicated
    if (result.brand && result.name.toLowerCase().startsWith(result.brand.toLowerCase())) {
      const trimmed = result.name.slice(result.brand.length).replace(/^[\s\-–—]+/, '').trim();
      if (trimmed.length > 5) result.name = trimmed;
    }

    return Response.json({ product: result });

  } catch (err) {
    console.error('Scrape error:', err.message);
    return Response.json({ error: 'Failed to extract product info' }, { status: 500 });
  }
}

// Helpers

function cleanText(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function extractMeta(html, property) {
  const re = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(re);
  if (match) return cleanText(match[1]);
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
  const match2 = html.match(re2);
  return match2 ? cleanText(match2[1]) : '';
}

function extractTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = html.match(re);
  return match ? cleanText(match[1].replace(/<[^>]+>/g, '')) : '';
}

function extractSize(name) {
  // Match patterns like "32oz", "16 oz", "1 gallon", "500ml", "32 fl oz", "1L", etc.
  const sizeMatch = name.match(/(\d+\.?\d*)\s*(fl\.?\s*)?(?:oz|ounce|ml|liter|litre|gallon|gal|pt|qt|quart|pint)\b/i);
  if (sizeMatch) return sizeMatch[0].trim();

  const volMatch = name.match(/\b(\d+\.?\d*)\s*(?:L|ml|gal)\b/i);
  if (volMatch) return volMatch[0].trim();

  return '';
}

// Amazon-specific extraction
function extractAmazon(html, result) {
  if (!result.name) {
    const titleMatch = html.match(/id=["']productTitle["'][^>]*>([^<]+)/i);
    if (titleMatch) result.name = cleanText(titleMatch[1]);
  }
  if (!result.brand) {
    const brandMatch = html.match(/id=["']bylineInfo["'][^>]*>[^<]*<[^>]*>([^<]+)/i)
      || html.match(/"brand"\s*:\s*"([^"]+)"/i);
    if (brandMatch) result.brand = cleanText(brandMatch[1]).replace(/^Visit the\s+/i, '').replace(/\s+Store$/i, '');
  }
  if (!result.price) {
    const priceMatch = html.match(/class=["']a-price-whole["'][^>]*>([^<]+)/i);
    const fracMatch = html.match(/class=["']a-price-fraction["'][^>]*>([^<]+)/i);
    if (priceMatch) {
      const whole = priceMatch[1].replace(/[^0-9]/g, '');
      const frac = fracMatch ? fracMatch[1].replace(/[^0-9]/g, '') : '00';
      result.price = parseFloat(`${whole}.${frac}`);
    }
  }
  if (!result.size) {
    const sizeMatch = html.match(/(?:Size|Volume|Item Volume)[:\s]*<[^>]*>([^<]+)/i)
      || html.match(/(?:Size|Volume)[:\s]*([^\n<]+)/i);
    if (sizeMatch) result.size = cleanText(sizeMatch[1]);
  }
}

// Chemical Guys specific
function extractChemicalGuys(html, result) {
  if (!result.brand) result.brand = 'Chemical Guys';
  if (!result.size) {
    const sizeMatch = html.match(/(\d+\.?\d*\s*(?:oz|gallon|gal))/i);
    if (sizeMatch) result.size = sizeMatch[1].trim();
  }
}

// Detail King specific
function extractDetailKing(html, result) {
  result.supplier = 'Detail King';
  if (!result.price) {
    const priceMatch = html.match(/class=["'][^"']*product-price[^"']*["'][^>]*>\s*\$?([\d,.]+)/i);
    if (priceMatch) result.price = parseFloat(priceMatch[1].replace(',', ''));
  }
}

// Autogeek specific
function extractAutogeek(html, result) {
  result.supplier = 'Autogeek';
  if (!result.brand) {
    const brandMatch = html.match(/class=["'][^"']*brand[^"']*["'][^>]*>([^<]+)/i);
    if (brandMatch) result.brand = cleanText(brandMatch[1]);
  }
}

// Aviation supplier generic extractor
function extractAviationSupplier(html, result, supplier) {
  result.supplier = supplier;
  // Many aviation e-commerce sites use standard Shopify/WooCommerce patterns
  if (!result.brand) {
    // Try vendor/brand from common e-commerce patterns
    const brandMatch = html.match(/class=["'][^"']*(?:product-vendor|brand)[^"']*["'][^>]*>([^<]+)/i)
      || html.match(/itemprop=["']brand["'][^>]*>([^<]+)/i)
      || html.match(/itemprop=["']brand["'][^>]*content=["']([^"']+)["']/i);
    if (brandMatch) result.brand = cleanText(brandMatch[1]);
  }
  if (!result.price) {
    // Shopify money format
    const priceMatch = html.match(/class=["'][^"']*(?:product-price|current-price|ProductMeta__Price)[^"']*["'][^>]*>\s*\$?([\d,.]+)/i)
      || html.match(/class=["']money["'][^>]*>\s*\$?([\d,.]+)/i);
    if (priceMatch) result.price = parseFloat(priceMatch[1].replace(',', ''));
  }
  if (!result.image) {
    // Try product image patterns
    const imgMatch = html.match(/class=["'][^"']*product-(?:featured-)?image[^"']*["'][^>]*src=["']([^"']+)["']/i)
      || html.match(/id=["']ProductPhoto["'][^>]*src=["']([^"']+)["']/i);
    if (imgMatch) result.image = imgMatch[1].startsWith('//') ? 'https:' + imgMatch[1] : imgMatch[1];
  }
}

// Category detection from product text
function guessCategory(text) {
  const t = text.toLowerCase();
  const brand = guessBrand(t);

  const categoryKeywords = {
    compound: ['compound', 'cutting', 'cut polish'],
    polish: ['polish', 'finishing', 'swirl remover', 'glaze'],
    wax: ['wax', 'sealant', 'paste wax'],
    ceramic: ['ceramic', 'coating', 'graphene', 'si02', 'sio2'],
    cleaner: ['cleaner', 'all purpose', 'apc', 'wash', 'shampoo', 'soap', 'waterless'],
    degreaser: ['degreaser', 'solvent', 'tar remover', 'iron remover'],
    brightwork: ['brightwork', 'metal polish', 'aluminum', 'chrome'],
    leather: ['leather', 'vinyl', 'interior', 'carpet', 'fabric'],
    towels: ['towel', 'cloth', 'microfiber', 'chamois'],
    applicators: ['applicator', 'pad', 'buffer', 'foam pad', 'backing plate', 'mitt'],
  };

  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => t.includes(kw))) return { category: cat, brand };
  }

  return { category: 'other', brand };
}

function guessBrand(text) {
  const brands = [
    "Meguiar's", 'Chemical Guys', 'P&S', 'Adams', 'Griot', 'Rupes',
    'Sonax', 'Collinite', 'Optimum', 'CarPro', 'Gtechniq', 'Koch Chemie',
    '3M', 'Angelwax', 'Auto Finesse', 'Gyeon', 'Detail King',
    'Malco', 'Presta', 'Lake Country', 'Buff and Shine',
    'Nuvite', 'Fly Shiny', 'Real Clean', 'Zip-Chem', 'Aero-Sense',
    'Pratt & Whitney', 'Turbine', 'Brulin', 'Celeste',
  ];
  for (const b of brands) {
    if (text.toLowerCase().includes(b.toLowerCase())) return b;
  }
  return '';
}
