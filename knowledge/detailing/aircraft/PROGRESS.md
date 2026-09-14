# Detailing AI — aircraft manuals ingest progress

| Metric | Count |
|---|---|
| CRM catalog models | 220 |
| Aircraft profile files | 220 |
| Model-specific extracts | 13 |
| Model-family extracts | 50 |
| Type-class fallback only | 157 |
| Pct with model-specific or family | 28.6% |
| Pct type-class fallback | 71.4% |

**Coverage:** 100% of catalog has a profile file.

## Before this web ingest (baseline)

| Metric | Count |
|---|---|
| Model-specific | 6 |
| Model-family | 21 |
| Type-class fallback | 193 |

## Aviation_Manuals pack (prior)

AMM.pdf, ANAC_Manual_TAG0100.pdf, Beechcraft_MandP_Specifications_Index.pdf, Bonanza_Annual_Inspection.pdf, CS-STAN_Issue_4.pdf, Discretionary_MX_05-19-00.pdf, FAA_AC_43.13-1B.pdf, G58_Baron_Ext_Cleaning_Scheduled_Service.pdf, Skyhawk_PIM.pdf

## Web ingest Aviation_Manuals_Web (2026-09-14)

Free/public PDFs downloaded to `/Users/brettberry/Downloads/Aviation_Manuals_Web/`:

- Official Robinson R22/R44/R44II/R66 POH Section 8 (robinsonheli.com CDN)
- FAA AC 43-4B, InFO16005, AC 43-205 (cancelled note)
- Piper PA-28-181 POH (Fox Flying / Condor / Salmon Arm public postings)
- Cirrus SR22 POH Section 8 (flight-school public posting)
- Pilatus PC-12 Ground Servicing Guide (official Technical Publications)
- Gulfstream MM 12-35-01 External Wash (public library mirror)
- Bell 407 Donaldson IBF ICA (aircraft washing §7.7)
- Cessna 182 Service Manual 1969–1976 (aeroelectric public posting)

### Upgraded this run
- **Model-specific:** Robinson R22/R44/R66, Piper PA-28, Cirrus SR20/22, Pilatus PC-12, Bell 407
- **Model-family:** other Pipers (metal), Cessna SEP (152–210), Pilatus PC-24, all Gulfstreams, Bell 206/210/212/214/412/427/430/47, Cessna 182
- **Sources-wanted (paywalled):** Caravan 208, Phenom 100/300, Challenger 350, Global 6500/6000, Falcon 7X, Mooney M20J, HondaJet

### Still type-class / upgrade queue
Bombardier Lear/Global deeper AMM, Embraer Praetor/Legacy, Dassault Falcon fleet, Airbus/Eurocopter helo SPM, Sikorsky, Citation Latitude/Longitude deeper OEM, King Air Communiqué 99-001 Aircraft Cleaning (OEM index only — PDF not freely posted this run).
