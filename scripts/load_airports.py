#!/usr/bin/env python3
"""
Load worldwide airport reference data into the `airports` table.

Source: OurAirports open data (public domain) — airports.csv + runways.csv.
Enriches each airport with:
  - type (small/medium/large/heliport/seaplane_base)
  - runway_length_ft (longest runway)
  - elevation_ft, lat/lng, city, country, iso_region, scheduled_service
  - airport_class: bizav-relevant taxonomy derived from the airport name
    (international | executive | regional | municipal | county |
     metropolitan | field | airpark | major | general)

FBO / MRO counts are intentionally left null here — those require a separate
data source (FAA Part 145 for MRO; AirNav/AC-U-KWIK for FBO).

Idempotent: upserts on the `icao` primary key. Safe to re-run.
"""
import csv, io, json, os, re, sys, urllib.request, time

AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
RUNWAYS_URL  = "https://davidmegginson.github.io/ourairports-data/runways.csv"
ENV_FILE     = os.path.join(os.path.dirname(__file__), "..", ".env.production")

def load_env(path):
    env = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
            if not m:
                continue
            v = m.group(2).strip().strip('"').strip("'")
            if v.endswith("\\n"):
                v = v[:-2]
            env[m.group(1)] = v.strip()
    return env

def fetch_csv(url):
    print(f"  downloading {url} ...", flush=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))

def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None

def to_num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def classify(name, atype):
    n = (name or "").lower()
    # Priority order: most specific bizav-relevant categories first.
    for kw, cls in [
        ("international", "international"),
        ("executive",    "executive"),
        ("regional",     "regional"),
        ("metropolitan", "metropolitan"),
        ("metro ",       "metropolitan"),
        ("municipal",    "municipal"),
        ("county",       "county"),
        ("airpark",      "airpark"),
        ("air park",     "airpark"),
    ]:
        if kw in n:
            return cls
    if re.search(r"\bfield\b", n):
        return "field"
    return {
        "large_airport":  "major",
        "medium_airport": "general",
        "small_airport":  "general",
        "heliport":       "heliport",
        "seaplane_base":  "seaplane",
        "balloonport":    "balloonport",
    }.get(atype, "general")

def main():
    env = load_env(ENV_FILE)
    base = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    key  = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    if not base or not key:
        sys.exit("Missing SUPABASE_URL / service role key in .env.production")

    print("Fetching OurAirports data...")
    runways = fetch_csv(RUNWAYS_URL)
    longest = {}
    for r in runways:
        ident = r.get("airport_ident")
        ln = to_int(r.get("length_ft"))
        if ident and ln:
            if ln > longest.get(ident, 0):
                longest[ident] = ln
    print(f"  longest-runway computed for {len(longest):,} airports")

    airports = fetch_csv(AIRPORTS_URL)
    rows = []
    for a in airports:
        ident = (a.get("ident") or "").strip()
        atype = (a.get("type") or "").strip()
        if not ident or atype == "closed":
            continue
        rows.append({
            "icao": ident,
            "iata": (a.get("iata_code") or "").strip() or None,
            "local_code": (a.get("local_code") or "").strip() or None,
            "gps_code": (a.get("gps_code") or "").strip() or None,
            "name": a.get("name") or None,
            "lat": to_num(a.get("latitude_deg")),
            "lng": to_num(a.get("longitude_deg")),
            "type": atype or None,
            "country": (a.get("iso_country") or "").strip() or None,
            "city": (a.get("municipality") or "").strip() or None,
            "iso_region": (a.get("iso_region") or "").strip() or None,
            "elevation_ft": to_int(a.get("elevation_ft")),
            "scheduled_service": (a.get("scheduled_service") == "yes"),
            "runway_length_ft": longest.get(ident),
            "airport_class": classify(a.get("name"), atype),
            "enriched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })

    print(f"Upserting {len(rows):,} airports into Supabase (batches of 1000)...")
    url = base.rstrip("/") + "/rest/v1/airports?on_conflict=icao"
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    BATCH = 200
    sent = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        data = json.dumps(chunk).encode("utf-8")
        for attempt in range(6):
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    resp.read()
                break
            except urllib.error.HTTPError as e:
                sys.exit(f"Batch {i//BATCH} failed: {e.code} {e.read().decode()[:300]}")
            except Exception as e:
                if attempt == 5:
                    sys.exit(f"Batch {i//BATCH} gave up after retries: {e}")
                time.sleep(1.5 * (attempt + 1))
        sent += len(chunk)
        if (i // BATCH) % 25 == 0:
            print(f"  {sent:,}/{len(rows):,}", flush=True)
    print(f"Done. {sent:,} airports loaded.")

if __name__ == "__main__":
    main()
