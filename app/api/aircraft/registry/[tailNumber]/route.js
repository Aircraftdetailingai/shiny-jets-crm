export const dynamic = 'force-dynamic';

// GET /api/aircraft/registry/[tailNumber]
// Fetches aircraft registration info from FAA public registry
export async function GET(request, { params }) {
  const { tailNumber } = await params;
  if (!tailNumber) return Response.json({ error: 'Tail number required' }, { status: 400 });

  const nNumber = tailNumber.toUpperCase().replace(/^N/, '');

  try {
    // FAA Aircraft Registry API
    const res = await fetch(
      `https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=${nNumber}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShinyjetsAviation/1.0)',
          'Accept': 'text/html',
        },
      }
    );

    if (!res.ok) {
      return Response.json({ error: 'FAA registry unavailable', status: res.status }, { status: 502 });
    }

    const html = await res.text();

    // Parse registration data from FAA HTML response
    const registration = parseRegistration(html, nNumber);

    if (!registration.found) {
      return Response.json({
        tail_number: `N${nNumber}`,
        found: false,
        message: 'No registration found for this N-number',
      });
    }

    return Response.json({
      tail_number: `N${nNumber}`,
      found: true,
      ...registration,
      source: 'faa_registry',
    });
  } catch (err) {
    return Response.json({ error: 'Registry lookup failed: ' + err.message }, { status: 500 });
  }
}

function parseRegistration(html, nNumber) {
  const result = { found: false };

  // Check if the page has results
  if (!html.includes('Aircraft Description') && !html.includes('Manufacturer Name')) {
    return result;
  }

  result.found = true;

  // Extract fields using regex patterns from FAA's HTML
  const extract = (label) => {
    const patterns = [
      new RegExp(`${label}[\\s\\S]*?<td[^>]*>\\s*([^<]+)`, 'i'),
      new RegExp(`${label}[^:]*:\\s*</td>\\s*<td[^>]*>\\s*([^<]+)`, 'i'),
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  result.registrant_name = extract('Registrant Name') || extract('Name');
  result.manufacturer = extract('Manufacturer Name');
  result.model = extract('Model');
  result.serial_number = extract('Serial Number');
  result.year = extract('Year Manufacturer') || extract('Year Mfr');
  result.engine_type = extract('Engine Type') || extract('Type Engine');
  result.aircraft_type = extract('Type Aircraft');
  result.status = extract('Status');
  result.certificate_issue_date = extract('Certificate Issue Date');
  result.expiration_date = extract('Expiration Date');

  return result;
}
