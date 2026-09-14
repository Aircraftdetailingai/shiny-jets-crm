# ADAI POH/PIM web ingest report — PASS 2 — 2026-09-14 (PT)

Continues pass 1 (`adai-poh-web-ingest.md`). Shopify work remains **STOPPED**.

## Specificity counts

| | Pass1 after | Pass2 after |
|---|---:|---:|
| Model-specific | 13 | **22** |
| Model-family | 50 | **76** |
| Type-class fallback | 157 | **122** |
| Pct model-specific or family | 28.6% | **44.5%** |

Delta vs pass1: **−35** type-class fallbacks (−157→122). Delta vs original baseline 193: **−71**.

## URLs ingested this pass (free/public)

| Source | URL | Result |
|---|---|---|
| Mooney M20J POH | https://www.mattbeyer.com/poh/Mooney-M20J-POH.pdf | Sec VIII Exterior Care → M20J specific + M20K family |
| Cessna 208B POH/PIM | http://aeroelectric.com/Reference_Docs/Cessna/cessna-poh/Cessna_208_C208B-G1000_Grandcaravan_POH-PIM_2008.pdf | Sec 8 Cleaning → Caravan model-specific |
| MD 500E RFM | https://www.heliczech.cz/wp-content/uploads/2024/07/POH-MD500E.pdf | Sec VII cleaning → 500E specific + 520N/530F/600N family |
| Enstrom MM Rev 15 | https://enstromhelicopter.com/wp-content/uploads/2024/11/F-28F-280F-Series-MM-Rev-15-Complete.pdf | §4-72–4-75 → F-28F specific + Enstrom family |
| Enstrom F-28F OM | https://www.sweetaviation.com/wp-content/uploads/2015/04/F-28F-manual.pdf | Transparent plastic note |
| HondaJet SL-420-12-005 | https://www.frasersaerospace.com/wp-content/uploads/2024/03/Paint-Finish-Matte-Flat-Satin-Care-and-Maintenance6.pdf | Matte/flat/satin → HA-420 model-specific |
| Cirrus Vision QRG | https://cdn.sprinkle.com/library/pdfs/4a51fa1f-0932-4a58-aa22-a333d5ae770e.pdf | Windshield + TKS no-wax → SF50 model-specific |
| Pilatus PC-24 GSG | https://www.pilatus-aircraft.com/assets/files/Technical-Publications/Ground-Servicing-Guide_PC-24.pdf | Exterior/windows → PC-24 model-specific |
| Kodiak SN16-01 | https://s23434.pcdn.co/wp-content/uploads/2016/08/KODIAK_SN16_01CorrosionPreventionandControlProgramfortheKODIAK100_R00.pdf | Wash/wax/CPC → Kodiak 100 specific + 900 family |
| AS350 IBF ICA | https://www.donaldson.com/.../Airbus-AS350-IBF-ICA.pdf | §7.7 wash → AS350/H125/EC130 family |
| Cabri G2 RFM | https://pilotswhoaskwhy.com/wp-content/uploads/2021/08/cabri-g2-poh-issue-05.pdf | Handling/clean note → Cabri model-specific |
| Piaggio AD E7-23343 | https://www.govinfo.gov/content/pkg/FR-2007-12-03/pdf/E7-23343.pdf | Points to AMM 12-24-02 → P.180 family |
| Air Tractor training | https://airtractor.com/wp-content/uploads/2016/10/AT-402-502-504-602-Pilot_Training_Course.pdf | + NAAA bulletin → Air Tractor family |
| NAAA AT-802 OM note | https://www.agaviation.org/wp-content/uploads/2025/03/118.pdf | Cleaning frequency emphasis |

## Tried / paywalled / not usable

| Target | Outcome |
|---|---|
| Wipaire Fire Boss AT-802 SM | HTTP 403 |
| Cabri G2 RFM Issue 10.1 cabri-usa | 404 |
| HondaJet full POM (jimcontent) | Only ~20 pages stub — incomplete; used SL instead |
| King Air Communiqué 99-001 | Still index-only; full PDF not freely posted |
| Embraer Phenom/Praetor POH Sec 8 | Paywalled |
| Dassault Falcon / Bombardier Global/Lear AMM wash | Paywalled / ambiguous effectivity |
| Boeing/Airbus jetliner AMM wash | Paywalled |
| Sikorsky S-76 OEM | No free cleaning chapter confirmed |
| Piper J-3 Cub OM (stpeteair) | Downloaded but scanned/image PDF — no extractable text this run |
| Eclipse EA500 AMM | Paywalled |
| Daher TBM POH Sec 8 | ManualsLib/easymanuals index only — no free full PDF |
| Mooney luxos POH | Only 15 pages incomplete |
| AS350 Mauna Loa “RFM” | 12-page stub / incomplete download artifact |

## Legal posture
- Preferred official free OEM (Enstrom, Pilatus, Honda SL via public mirror, FAA AD, Air Tractor).
- Public flight-school / library postings for Mooney, Caravan, MD 500E, Cabri, Cirrus QRG.
- No Textron/Boeing/Bombardier/Embraer/Dassault paid-library dumps; no full AMM pirate archives.
- Detailing excerpts only; U-turn + hold-harmless retained on all profiles.

## Knowledge artifacts (new manuals/)
- mooney-m20j-poh-section8-exterior-care.md
- cessna-208-poh-section8-cleaning-care.md
- md500e-rfm-section7-cleaning.md
- enstrom-f28f-mm-cleaning.md
- honda-ha420-sl-matte-flat-satin-care.md
- cirrus-vision-sf50-cleaning-qrg.md
- pilatus-pc24-gsg-exterior-windows-clean.md
- daher-kodiak-sn16-01-corrosion-wash.md
- as350-h125-ibf-aircraft-washing-note.md
- guimbal-cabri-g2-rfm-handling-clean-note.md
- piaggio-p180-amm-12-24-02-exterior-cleaning-note.md
- air-tractor-wash-corrosion-note.md

## Still fallback (~122) — why
Most remaining are OEM-portal-only business jets/airliners/military helos (Bombardier, Embraer, Dassault, Boeing, Airbus airliners, Sikorsky, remaining Airbus helos, TBM, Eclipse, Bell unknowns, Aero Commander, Van’s RV-10 without OEM wash chapter, Cub scanned OM). Type-class + FAA AC 43-4B/InFO16005 still apply.

## Repos / branch
- shiny-jets-crm + aircraftdetailing-ai: `feat/detailing-ai-poh-pass2`
