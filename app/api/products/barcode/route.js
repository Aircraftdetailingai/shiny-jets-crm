// Barcode lookup — accepts UPC/EAN, returns normalized product info
// Used by both crew and owner Add Product modals
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getUser(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const payload = await verifyToken(authHeader.slice(7));
    if (payload) return payload;
  }
  return null;
}

function inferCategory(title = '', categoryString = '') {
  const text = `${title} ${categoryString}`.toLowerCase();
  if (/polish|compound|cutting/.test(text)) return 'polish';
  if (/wax|carnauba/.test(text)) return 'wax';
  if (/ceramic|coating|sio2/.test(text)) return 'ceramic';
  if (/cleaner|degreaser|wash|soap|shampoo/.test(text)) return 'cleaner';
  if (/leather|conditioner/.test(text)) return 'leather';
  if (/towel|microfiber|applicator|pad/.test(text)) return 'applicators';
  if (/bright|chrome|metal/.test(text)) return 'brightwork';
  return 'other';
}

function parseSize(text = '') {
  // Match e.g. "32 oz", "1 gal", "500 ml", "16oz"
  const m = text.match(/(\d+(?:\.\d+)?)\s*(oz|fl\s*oz|ml|l|liter|gal|gallon|lb|pound|pack|pk|count|ct)/i);
  if (!m) return { size: null, unit: null };
  const num = parseFloat(m[1]);
  let unit = m[2].toLowerCase().replace(/\s+/g, '');
  if (unit === 'floz') unit = 'oz';
  if (unit === 'liter' || unit === 'l') unit = 'ml';
  if (unit === 'gallon') unit = 'gal';
  if (unit === 'pound') unit = 'lb';
  if (unit === 'pk' || unit === 'ct') unit = 'count';
  return { size: num, unit };
}

export async function GET(request) {
  // Require any authenticated user (detailer or crew)
  const user = await getUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const rawBarcode = (searchParams.get('upc') || '').trim();

  if (!rawBarcode || rawBarcode.length < 4) {
    return Response.json({ found: false, upc: rawBarcode }, { status: 200 });
  }

  // Check if this is an Amazon ASIN (B0XXXXXXXXX format)
  const isASIN = /^B[0-9A-Z]{9}$/i.test(rawBarcode);
  if (isASIN) {
    try {
      const asinRes = await fetch(`https://www.amazon.com/dp/${rawBarcode}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (asinRes.ok) {
        const html = await asinRes.text();
        const titleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i)
          || html.match(/<title[^>]*>([^<]+)</i);
        const imageMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i);
        if (titleMatch) {
          const title = titleMatch[1].replace(/ : Amazon\.com.*$/, '').replace(/ - Amazon\.com.*$/, '').trim();
          const { size, unit } = parseSize(title);
          return Response.json({
            found: true, upc: rawBarcode,
            product: { name: title, brand: '', size, unit, category: inferCategory(title, ''), image_url: imageMatch?.[1] || null, upc: rawBarcode },
          });
        }
      }
    } catch (e) {
      console.log('[barcode] ASIN lookup failed:', e.message);
    }
    // ASIN not found — return barcode as name hint
    return Response.json({ found: false, upc: rawBarcode, hint: `Amazon ASIN: ${rawBarcode}` });
  }

  // For numeric barcodes (UPC/EAN)
  const upc = rawBarcode.replace(/\D/g, '');
  if (!upc || upc.length < 8) {
    return Response.json({ found: false, upc: rawBarcode, hint: rawBarcode });
  }

  // Try Open Food Facts first (free, no rate limits)
  try {
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (offRes.ok) {
      const offData = await offRes.json();
      if (offData.status === 1 && offData.product?.product_name) {
        const p = offData.product;
        const { size, unit } = parseSize(`${p.product_name} ${p.quantity || ''}`);
        return Response.json({
          found: true, upc,
          product: {
            name: p.product_name, brand: p.brands || '', size, unit,
            category: inferCategory(p.product_name, p.categories || ''),
            image_url: p.image_url || p.image_front_url || null, upc,
          },
        });
      }
    }
  } catch (e) {
    console.log('[barcode] OpenFoodFacts failed:', e.message);
  }

  // Fallback to upcitemdb
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error('[barcode] upcitemdb status:', res.status);
      return Response.json({ found: false, upc, hint: `UPC: ${upc}` });
    }

    const data = await res.json();

    if (data.code === 'INVALID_UPC' || !data.items || data.items.length === 0) {
      return Response.json({ found: false, upc, hint: `UPC: ${upc}` });
    }

    const item = data.items[0];
    const { size, unit } = parseSize(`${item.title} ${item.size || ''}`);
    const image = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null;

    return Response.json({
      found: true,
      upc,
      product: {
        name: item.title || '',
        brand: item.brand || '',
        model: item.model || '',
        description: item.description || '',
        size,
        unit,
        category: inferCategory(item.title, item.category),
        image_url: image,
        upc,
      },
    });
  } catch (err) {
    console.error('[barcode] lookup error:', err.message);
    return Response.json({ found: false, upc, hint: `UPC: ${upc}`, error: 'Lookup failed' });
  }
}
