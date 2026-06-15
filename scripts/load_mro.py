#!/usr/bin/env python3
"""
Source-agnostic MRO (maintenance/repair organization) -> airport loader.

Aviation authorities (FAA Part 145, EASA Part-145, UK CAA, Transport Canada,
CASA, etc.) publish *lists of approved maintenance organizations* — names and
addresses, but NOT airport codes or coordinates. This pipeline normalizes any
such list into a per-airport `mro_count` on the airports table:

    1. Read a CSV of organizations (name + location columns).
    2. Geocode each to lat/lng (OpenStreetMap Nominatim, free, 1 req/sec).
    3. Assign each to the nearest *real* airport (has a runway) within MAX_KM,
       using haversine distance against the loaded airports table.
    4. Aggregate counts and write airports.mro_count.

Because it's source-agnostic, the SAME script ingests an FAA crosstab export,
an EASA dataset export, or any national CAA list — just map the columns.

Usage:
    python3 load_mro.py --sample            # built-in 5-row real sample (dry run)
    python3 load_mro.py path/to/orgs.csv --name-col Name --city-col City \\
        --state-col State --country-col Country [--address-col Address] [--write]

Without --write it's a DRY RUN (prints assignments, touches nothing).
"""
import argparse, csv, json, math, os, re, sys, time, urllib.parse, urllib.request

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env.production")
MAX_KM = 15.0           # an MRO further than this from any airport is not "at" one
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "ShinyJetsCRM-MRO-Loader/1.0 (ops@shinyjets.com)"

SAMPLE = [  # real, well-known US Part 145 MROs at known airports — for verification
    {"name": "Duncan Aviation",     "city": "Lincoln",        "state": "NE", "country": "USA"},  # KLNK
    {"name": "West Star Aviation",  "city": "Grand Junction", "state": "CO", "country": "USA"},  # KGJT
    {"name": "Gulfstream Aerospace","city": "Savannah",       "state": "GA", "country": "USA"},  # KSAV
    {"name": "StandardAero",        "city": "Springfield",    "state": "IL", "country": "USA"},  # KSPI
    {"name": "Stevens Aerospace",   "city": "Greenville",     "state": "SC", "country": "USA"},  # KGMU
]

def load_env(path):
    env = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
            if m:
                v = m.group(2).strip().strip('"').strip("'")
                env[m.group(1)] = v[:-2].strip() if v.endswith("\\n") else v.strip()
    return env

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def geocode(query):
    params = urllib.parse.urlencode({"q": query, "format": "json", "limit": 1})
    req = urllib.request.Request(NOMINATIM + "?" + params, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"    geocode error for {query!r}: {e}", file=sys.stderr)
    return None

def fetch_airports(env):
    """Pull real airports (with runways) from Supabase for nearest-neighbor matching."""
    base = (env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")).rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    airports, offset = [], 0
    while True:
        # Fixed-wing airports only — exclude heliports/seaplane bases, which sit
        # near city centers (hospitals etc.) and would steal matches from the
        # real airport an MRO actually operates at.
        url = (f"{base}/rest/v1/airports?select=icao,name,lat,lng,runway_length_ft,type"
               f"&type=in.(small_airport,medium_airport,large_airport)"
               f"&runway_length_ft=not.is.null&lat=not.is.null&limit=1000&offset={offset}")
        req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=60) as r:
            chunk = json.load(r)
        airports += chunk
        if len(chunk) < 1000:
            break
        offset += 1000
    return airports, base, key

def nearest(airports, lat, lng):
    best, bestd = None, 1e9
    for a in airports:
        d = haversine(lat, lng, a["lat"], a["lng"])
        if d < bestd:
            best, bestd = a, d
    return best, bestd

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--name-col", default="name")
    ap.add_argument("--address-col", default=None)
    ap.add_argument("--city-col", default="city")
    ap.add_argument("--state-col", default="state")
    ap.add_argument("--country-col", default="country")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    env = load_env(ENV_FILE)
    if args.sample:
        rows = SAMPLE
    elif args.csv:
        with open(args.csv, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    else:
        sys.exit("Provide a CSV path or --sample")

    print(f"Loading {len(rows)} organizations. Fetching airports for matching...")
    airports, base, key = fetch_airports(env)
    print(f"  {len(airports):,} runway-bearing airports available for matching\n")

    counts = {}
    for i, row in enumerate(rows):
        parts = [row.get(args.address_col) if args.address_col else None,
                 row.get(args.city_col), row.get(args.state_col), row.get(args.country_col)]
        query = ", ".join(p for p in parts if p)
        loc = geocode(query)
        time.sleep(1.1)  # Nominatim courtesy rate limit
        if not loc:
            print(f"  [{i+1}] {row.get(args.name_col)}: NO GEOCODE ({query})")
            continue
        ap_match, dist = nearest(airports, *loc)
        if dist > MAX_KM:
            print(f"  [{i+1}] {row.get(args.name_col)}: nearest {ap_match['icao']} is {dist:.1f}km (> {MAX_KM}km), skipped")
            continue
        counts[ap_match["icao"]] = counts.get(ap_match["icao"], 0) + 1
        print(f"  [{i+1}] {row.get(args.name_col):28s} -> {ap_match['icao']} ({ap_match['name']}, {dist:.1f}km)")

    print(f"\n{len(counts)} airports received MRO assignments:")
    for icao, c in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {icao}: {c}")

    if not args.write:
        print("\nDRY RUN — nothing written. Re-run with --write to persist mro_count.")
        return

    print("\nWriting mro_count to airports...")
    hdr = {"apikey": key, "Authorization": "Bearer " + key,
           "Content-Type": "application/json", "Prefer": "return=minimal"}
    for icao, c in counts.items():
        url = f"{base}/rest/v1/airports?icao=eq.{urllib.parse.quote(icao)}"
        body = json.dumps({"mro_count": c}).encode()
        req = urllib.request.Request(url, data=body, headers=hdr, method="PATCH")
        urllib.request.urlopen(req, timeout=30).read()
    print(f"Done. Updated {len(counts)} airports.")

if __name__ == "__main__":
    main()
