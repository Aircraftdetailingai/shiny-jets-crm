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
    // Try to scrape basic product info from Amazon
    try {
      const asinRes = await fetch(`https://www.amazon.com/dp/${rawBarcode}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShinyJetsCRM/1.0)' },
        redirect: 'follow',
      });
      if (asinRes.ok) {
        const html = await asinRes.text();
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (titleMatch) {
          const { size, unit } = parseSize(titleMatch[1]);
          return Response.json({
            found: true,
            upc: rawBarcode,
            product: {
              name: titleMatch[1],
              brand: '',
              size, unit,
              category: inferCategory(titleMatch[1], ''),
              image_url: imageMatch?.[1] || null,
              upc: rawBarcode,
            },
          });
        }
      }
    } catch (e) {
      console.log('[barcode] ASIN lookup failed:', e.message);
    }
    return Response.json({ found: false, upc: rawBarcode });
  }

  // For numeric barcodes (UPC/EAN), use upcitemdb
  const upc = rawBarcode.replace(/\D/g, '');
  if (!upc || upc.length < 8) {
    // Non-standard barcode format — return not found (no error, user can enter manually)
    return Response.json({ found: false, upc: rawBarcode });
  }

  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.error('[barcode] upcitemdb status:', res.status);
      return Response.json({ found: false, upc });
    }

    const data = await res.json();

    if (data.code === 'INVALID_UPC') {
      return Response.json({ found: false, upc });
    }

    if (!data.items || data.items.length === 0) {
      return Response.json({ found: false, upc });
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
    return Response.json({ error: 'Lookup failed', upc }, { status: 500 });
  }
}
