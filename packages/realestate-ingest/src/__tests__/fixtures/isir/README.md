# ISIR WS de-risk fixtures (Task 1, 2026-05-31)

Real data captured from the public ISIR SOAP WS
(`https://isir.justice.cz:8443/isir_public_ws/IsirWsPublicService`,
operation `getIsirWsPublicIdDataRequest`) via `@czagents/isir` `IsirClient.pollEvents`,
recent slice around `idPodnetu=70_000_000` (≈ April 2025 sample data).

## event-batch.sample.json
Curated subset (12 events) of real-estate-relevant `typUdalosti` codes pulled
from the live feed. Note `poznamka` is the RAW escaped XML blob; it carries ONLY
`idOsobyPuvodce` (court code) + `druhStavRizeni` (KONKURS/ODDLUŽENÍ/…). It does
**NOT** contain any property location. Property location lives only in the linked
`dokumentUrl` PDF.

## Dražba / real-estate event types found in the feed
| code | popisUdalosti | real-estate signal |
|------|---------------|--------------------|
| 335  | Dražební vyhláška | auction notice — but covers MOVABLES too (sample doc auctioned sewing machines) |
| 1081 | Vyhláška o zpeněžení majetku | monetization notice; often a final-report cover, location usually absent |
| 535  | Usnesení o prodeji mimo dražbu | sale outside auction — BEST clean property text |
| 1028 | Smlouva o prodeji mimo dražbu | sale contract |
| 174  | Usnesení o schválení oddlužení zpeněžením majetkové podstaty | |
| 50   | Zpráva o průběhu zpeněžení | progress report |
| 829  | Výpis z katastru nemovitostí | cadastre extract — mostly NEGATIVE findings (debtor owns nothing); SCANNED images |
| 37   | Sdělení Katastru nemovitostí | (older feed) cadastre notice |

## Extracted document texts (extraction reliability is the headline finding)
- `doc-535-...pdftotext.txt` — pdftotext CLEAN. Contains
  "v katastrálním území Nový Bohumín, obci Bohumín", parc. č., LV č. 2485.
  Property okres (Karviná) derivable from obec via a CUZK obec→okres table.
- `doc-1081-...pdftotext.txt` — pdftotext clean, but it is a FINAL-REPORT notice
  (cooperative share); NO property location, only debtor residence.
- `doc-829-...ocr-ces.txt` — type 829 is a SCANNED image (no embedded fonts);
  needs OCR (tesseract -l ces). Content here is a NEGATIVE finding ("nejsou
  evidována vlastnická práva"), i.e. not a property listing.
- `doc-335-...ocr-ces.txt` — Dražební vyhláška PDF uses Identity-H fonts with NO
  ToUnicode CMap → pdftotext yields MOJIBAKE. OCR recovers it, but this instance
  is a MOVABLE-property auction (no katastr/parcel/okres at all).
