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
        message: 'Aircraft not found. Please check your tail number and try again.',
      });
    }

    // Filter out drones and non-detailable aircraft
    const filtered = filterUnsupported(registration);
    if (filtered) {
      return Response.json({
        tail_number: `N${nNumber}`,
        found: false,
        filtered: true,
        reason: filtered,
        message: 'This aircraft type is not supported. Please enter a registered fixed-wing or rotary aircraft tail number.',
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

// Map FAA manufacturer names to our database names
const MANUFACTURER_MAP = {
  'GULFSTREAM AEROSPACE': 'Gulfstream',
  'GULFSTREAM AEROSPACE CORP': 'Gulfstream',
  'CESSNA': 'Cessna', 'CESSNA AIRCRAFT': 'Cessna', 'TEXTRON AVIATION': 'Cessna',
  'BEECHCRAFT': 'Beechcraft', 'BEECH': 'Beechcraft', 'HAWKER BEECHCRAFT': 'Beechcraft',
  'PIPER': 'Piper', 'PIPER AIRCRAFT': 'Piper',
  'CIRRUS': 'Cirrus', 'CIRRUS DESIGN': 'Cirrus',
  'BOMBARDIER': 'Bombardier', 'BOMBARDIER INC': 'Bombardier', 'LEARJET': 'Bombardier',
  'DASSAULT': 'Dassault', 'DASSAULT AVIATION': 'Dassault', 'DASSAULT FALCON': 'Dassault',
  'EMBRAER': 'Embraer', 'EMBRAER S A': 'Embraer',
  'BOEING': 'Boeing', 'THE BOEING COMPANY': 'Boeing',
  'AIRBUS': 'Airbus', 'AIRBUS INDUSTRIE': 'Airbus',
  'ROBINSON': 'Robinson', 'ROBINSON HELICOPTER': 'Robinson',
  'BELL': 'Bell', 'BELL HELICOPTER': 'Bell', 'BELL TEXTRON': 'Bell',
  'SIKORSKY': 'Sikorsky', 'SIKORSKY AIRCRAFT': 'Sikorsky',
  'LEONARDO': 'Leonardo', 'AGUSTA': 'Leonardo', 'AGUSTAWESTLAND': 'Leonardo',
  'PILATUS': 'Pilatus', 'PILATUS AIRCRAFT': 'Pilatus',
  'DAHER': 'Daher', 'DAHER-SOCATA': 'Daher', 'SOCATA': 'Daher',
  'HONDA': 'Honda', 'HONDA AIRCRAFT': 'Honda',
  'ECLIPSE': 'Eclipse', 'ECLIPSE AEROSPACE': 'Eclipse',
  'PIAGGIO': 'Piaggio', 'PIAGGIO AERO': 'Piaggio',
  'DIAMOND': 'Diamond', 'DIAMOND AIRCRAFT': 'Diamond',
  'MOONEY': 'Mooney',
};

// Map FAA model codes to our database model names
const MODEL_MAP = {
  'G-IV': 'G4', 'G-V': 'G550', 'G-VI': 'G650', 'G-IVSP': 'G4',
  'G-200': 'G280', 'GIV-X': 'G450', 'GV-SP': 'G550',
  'CJ3': 'Citation CJ3', 'CJ3+': 'Citation CJ3',
  'CJ4': 'Citation CJ4', 'CJ2': 'Citation CJ2',
  '525': 'Citation CJ1', '525A': 'Citation CJ2', '525B': 'Citation CJ3', '525C': 'Citation CJ4',
  '560XL': 'Citation XLS', '680': 'Citation Sovereign', '750': 'Citation X',
  'FALCON 900': 'Falcon 900', 'FALCON 2000': 'Falcon 2000', 'FALCON 7X': 'Falcon 7X',
  'GLOBAL 7500': 'Global 7500', 'CHALLENGER 350': 'Challenger 350',
  'PC-12': 'PC-12', 'PC-24': 'PC-24',
  'TBM 940': 'TBM 940', 'TBM 960': 'TBM 960',
};

function cleanManufacturer(raw) {
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();
  return MANUFACTURER_MAP[upper] || raw.split(' ')[0].charAt(0).toUpperCase() + raw.split(' ')[0].slice(1).toLowerCase();
}

function cleanModel(raw) {
  if (!raw) return null;
  const upper = raw.toUpperCase().trim();
  return MODEL_MAP[upper] || raw.trim();
}

// Drone/UAS manufacturers to reject
const DRONE_MANUFACTURERS = [
  'DJI', 'AUTEL', 'SKYDIO', 'PARROT', 'YUNEEC', 'EHANG', 'FIMI',
  'HOLY STONE', 'HUBSAN', 'SYMA', 'WINGTRA', 'SENSEFLY', 'DRAGANFLY',
];

// Valid aircraft type patterns (FAA "Aircraft Type" field values)
const VALID_TYPES = [
  /fixed wing/i,
  /rotorcraft/i,
  /helicopter/i,
  /turbojet/i,
  /turboprop/i,
  /glider/i,
];

// Reject these aircraft type patterns
const BLOCKED_TYPES = [
  /drone/i,
  /uas/i,
  /unmanned/i,
  /weight.?shift/i,
  /powered parachute/i,
  /ultralight/i,
  /balloon/i,
  /lighter than air/i,
];

function filterUnsupported(reg) {
  const mfr = (reg.raw_manufacturer || '').toUpperCase().trim();
  const type = (reg.aircraft_type || '').toLowerCase();
  const engineType = (reg.engine_type || '').toLowerCase();

  // Check drone manufacturers
  for (const drone of DRONE_MANUFACTURERS) {
    if (mfr.includes(drone)) return `drone_manufacturer:${drone}`;
  }

  // Check blocked aircraft types
  for (const pattern of BLOCKED_TYPES) {
    if (pattern.test(type)) return `blocked_type:${type}`;
  }

  // Check engine type for electric drones
  if (engineType === 'electric' && !VALID_TYPES.some(p => p.test(type))) {
    return `electric_non_aircraft`;
  }

  // If we have a type, ensure it's in the valid list
  if (type && !VALID_TYPES.some(p => p.test(type))) {
    return `unsupported_type:${type}`;
  }

  return null; // Passes filter
}

function parseRegistration(html, nNumber) {
  const result = { found: false };

  // Check if the page has results
  if (!html.includes('Aircraft Description') && !html.includes('Manufacturer Name')) {
    return result;
  }

  result.found = true;

  // FAA HTML uses paired <td> elements:
  //   <td data-label="">Label Text</td>
  //   <td data-label="Label Text">Value</td>
  // Match the value td by its data-label attribute
  const extract = (label) => {
    // Match data-label="Label" (case-insensitive) and capture the td content
    const pattern = new RegExp(
      `data-label="${label}"[^>]*>\\s*([^<]+)`,
      'i'
    );
    const m = html.match(pattern);
    const val = m?.[1]?.trim();
    return val && val !== 'None' ? val : null;
  };

  // Registered Owner is in a separate section — use data-label="Name" after "Registered Owner"
  const ownerSection = html.split(/Registered Owner/i)[1] || '';
  const ownerMatch = ownerSection.match(/data-label="Name"[^>]*>\s*([^<]+)/i);
  result.registrant_name = ownerMatch?.[1]?.trim() || null;

  const rawManufacturer = extract('Manufacturer Name');
  const rawModel = extract('Model');
  result.manufacturer = cleanManufacturer(rawManufacturer);
  let model = cleanModel(rawModel);
  if (model && (/^serial/i.test(model) || /^[0-9]+$/.test(model) || model.length < 2)) model = null;
  result.model = model;
  result.raw_manufacturer = rawManufacturer;
  result.raw_model = rawModel;
  result.serial_number = extract('Serial Number');
  result.year = extract('Mfr Year') || extract('Year Manufacturer');
  result.engine_type = extract('Engine Type');
  result.aircraft_type = extract('Aircraft Type');
  result.status = extract('Status');
  result.certificate_issue_date = extract('Certificate Issue Date');
  result.expiration_date = extract('Expiration Date');

  return result;
}
