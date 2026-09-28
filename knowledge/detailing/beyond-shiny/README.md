# Beyond Shiny — Detailing AI knowledge (digest)

Brett Berry's book *Beyond Shiny – The Shiny Jets Approach to Aircraft Detailing*, ingested as a **topic digest**, a **section index**, and a **safety-cautions extract**. This folder does **not** contain the full text.

## Precedence rule (also in the Detailing AI SYSTEM_PROMPT)
1. **Brett's Shiny Jets methods win.** The Shiny Jets methods (Sep 28, 2026) are stored privately in Supabase (`private_knowledge`, server-only) and override this book where they conflict on products, pads, or steps.
   - Example: the book's medium-oxidation method (DA + Rupes blue wool pad + Fly Shiny Pro Cut) is superseded for current single-stage work by the Shiny Jets method.
   - The book does **not** cover clearcoat. For clearcoat, use the Shiny Jets method.
   - The full book text is also stored privately in `private_knowledge` (source `beyond-shiny`); this folder is only the public digest.
2. **The book's safety and FAA cautions ALWAYS apply**, even when a Shiny Jets method overrides the book's products. See `safety-cautions.md`. Examples: pitot tube and static port covers; no interior fogging; brightwork kept under 150°F; MEK only as a coin-sized last resort with gloves and a respirator; Agemaster never on silver boots; landing gear strut and seal cautions; ceramic coating needs OEM approval.
3. **Never invent chemical mixes or dilutions.** Only repeat ratios the book states. Otherwise say "follow the manufacturer label."

## Files
| File | Book section |
|---|---|
| `safety-cautions.md` | Safety / FAA / damage cautions (always apply; the loader boosts it whenever a query touches a covered topic) |
| `paint-single-stage-oxidation-test-patch.md` | Coverage gaps, single-stage vs clearcoat, oxidation levels, test patches |
| `paint-compound-polish-pads-rotary-da.md` | Compounds, polishes, pads, rotary/DA/Tornador settings |
| `paint-protection-wax-sealant-rejex.md` | Wax, sealant, spray ceramic, RejeX |
| `ceramic-fly-shiny-pro-air-guard.md` | Fly Shiny Pro ceramic program, Air Guard, recharge |
| `brightwork-polish-granitize.md` | Brightwork polishing and Granitize protection |
| `deice-boots-agemaster-shinemaster-icex.md` | De-ice boots (BFGoodrich black/silver, Ice Shield, PBS) |
| `wash-dry-wet-pitot-static.md` | Dry wash and wet wash |
| `interior-maintenance-leather-suede.md` | Interior maintenance, leather, suede |
| `carpet-extraction-stains.md` | Carpet extraction and stain methods |
| `acrylic-windows-polish.md` | Unpressurized acrylic windows |
| `towels-microfiber.md` | Named towels |
| `quick-list.md` | Book-era pad + product + tool quick list (superseded items are flagged inline) |
| `index.md` | Section index with line ranges (reference only; the loader ignores it unless "Beyond Shiny" is named) |

`[Lxxx]` citations are line numbers in `beyond-shiny.txt`, the full text, which is kept in private storage.

## Copyright / storage
This repository is **public**, so the full book text (about 66.6k words) and chunked copies of it are **deliberately not committed**. Only this digest, the index, and short safety extracts are here. If full-text retrieval is wanted later, keep it in private storage (for example a private bucket or a private repo) and load it at runtime.
