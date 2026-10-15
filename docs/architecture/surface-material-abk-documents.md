# ABK's technical documents in the catalogue

J (14 Oct 2026): "Yes download all of them for my webapp and the ai to be smarter to have the knowledge to design". He then chose
ABK's **technical sheets**: the download area's 21 (one per collection; Block and Eterea have none), with the Plein Air catalogue,
which he had approved first with Plein Air's sheet. All 22 PDFs were read on 14 Oct 2026. They are filed in J's masters
(`material-masters/gardenia/abk-documents/`), and their sha256s are in the data. The other catalogues, the three brand guides
(installation and cleaning advice, technical characteristics, certifications) and the discontinued-item lists weren't downloaded.

The app's AI doesn't read any of this yet. The data is kept so that it can: every value names its sheet, and the catalogue entries
it changed note the sheet.

## Where it is

| File | What it holds |
| --- | --- |
| `lib/surface-material-abk-data/datasheets.json`, typed by `lib/surface-material-abk-datasheets.ts` | The 21 sheets in their own terms: what each covers (thickness, size, finish), DIN 51130 and DIN 51097 slip classes by finish, shade variation, water absorption, frost resistance, notes. |
| `lib/surface-material-abk-datasheet-lookup.ts` | `findAbkDatasheetMatch(entry)`: the sheet lines a catalogue entry fits, and the thickness and slip classes they agree on. |
| `lib/surface-material-plein-air-system.ts`, with `lib/surface-material-abk-data/plein-air-special-pieces.json` | The Plein Air catalogue: the range, its places (`PLEIN_AIR_SPACES`, `PLEIN_AIR_WELLNESS`), the laying systems and pedestals, "technical plus", packing (`getPleinAirPacking`) and special pieces by colour (`getPleinAirSpecialPieces(card)`). |
| `lib/surface-material-outdoor-knowledge.ts` | The outdoor facts, now with the catalogue's laying, places, special pieces, weight and packing. |

## What the sheets say

| Collection | Body (EN 14411 group) | DIN 51130 (shod) | DIN 51097 (bare foot) | Shade | Water absorption |
| --- | --- | --- | --- | --- | --- |
| Anima | Full body porcelain, BIa UGL; 20 mm X20 coloured body, BIa GL | R10 Nat, R11 Grip and R11 | A+B Nat, A+B+C Grip and R11 | V2 | ≤ 0.5% |
| Bon Ton | Dry-pressed ceramic tiles | – | – | – | Ev ≤ 0.3% |
| Camouflage | Full body coloured porcelain, BIa GL | R10 Nat, R11 R11 | B Nat, C R11 | V2 | ≤ 0.5% |
| Concrea Plain | Full body coloured porcelain, BIa GL | R10 Nat | A+B Nat | V2 | ≤ 0.5% |
| Dorica | Full body porcelain, BIa UGL; X20 coloured body, BIa GL | R10 Nat, R11 R11 | A+B Nat, A+B+C R11 | V2 | ≤ 0.5% |
| Epoque 2.0 | Full body coloured porcelain, BIa UGL | R10 Nat | A+B Nat | V2 | ≤ 0.5% |
| Falaise | Dry-pressed ceramic tiles | NPD | – | – | Ev ≤ 0.3% |
| Gioia | **White body wall tiles, BIII** | – | – | – | > 10% |
| Hermione | Full body coloured porcelain, BIa UGL | R10 Nat, R11 R11 | A Nat, A+B+C R11 | V2 | ≤ 0.5% |
| I Pigmenti | Full body porcelain, BIa UGL | R10 Nat | A+B Nat | V2 | ≤ 0.5% |
| Just Nature | Dry-pressed fine porcelain stoneware, BIa GL | R10 Nat, R11 R11 | A+B Nat, A+B+C R11 | V3 | ≤ 0.5% |
| La Geoteca | Full body porcelain, BIa UGL | R10 Nat, R11 R11 | B Nat, C R11 | V3 | ≤ 0.5% |
| La Marmoteca | Full body porcelain; Nat BIa UGL, Lux and Soft BIa GL | R10 Nat; none for Lux and Soft | A+B Nat | V3 | ≤ 0.5% |
| Luce | Full body porcelain, BIa UGL | R9 Nat, R11 Grip | A+B Grip | V2 | ≤ 0.5% |
| Make | Full body porcelain, BIa UGL | R10 Nat, R11 R11 | B Nat, C R11 | V3 (V4 Antracite and Nero Corten) | ≤ 0.5% |
| Orosei | Porcelain tiles, BIa GL (by thickness, not size) | R10 Nat, R11 R11 | A+B Nat 8.5 mm, A+B+C R11 | V3 | ≤ 0.5% |
| Oxide | Full body porcelain, BIa UGL | R10 Nat, R11 R11 | B Nat, C R11 | V3 | ≤ 0.5% |
| Pietra Viva | Dry-pressed fine porcelain stoneware, BIa GL | R10 Nat (80x80), R11 R11 | B Nat, C R11 | V2 | ≤ 0.5% |
| Plein Air | Porcelain stoneware, BIa UGL | – (the finish is R11) | – | – | ≤ 0.5% |
| Storm | Full body coloured porcelain, BIa GL | R10 Nat, R11 Grip and R11 | A+B Nat, A+B+C R11 | V2 | ≤ 0.5% |
| Tabulae | Dry-pressed ceramic tiles (Nat 20x120 only) | R10 Nat | – | V2 | Ev ≤ 0.3% |

Every porcelain sheet says frost resistant; Gioia's gives no frost value. The sheets cover only the formats they list: Tabulae's
only Nat 20x120, Pietra Viva's only Antique 3D Tech 120x120 and 60x120 and Nat P.Tech and R11 80x80, Epoque's (headed EPOQUE 21)
other sizes than the catalogue's.

## What changed in the catalogue

- **Slip classes:** 576 Gardenia entries get their sheet's DIN 51130 class in `physical_specs.slip_rating`: R10 for 548 natural
  finishes, R9 for Luce's 28 Natural entries. The 111 entries that had one (all R11) agree with their sheets.
- **Thickness:** 278 entries without `total_thickness_mm` got their sheet's on 14 Oct: 129 at 8.5 mm, 128 at 6 mm, Gioia's 21 at
  7 mm. On 15 Oct Gioia's 12 decor entries and 52 of La Marmoteca's 6 mm fills went to 8.5 mm, as ABK's pages say (below). The
  surface browser shows the thickness ("8.5 mm thick").
- Each entry the sheets filled notes the sheet (667 since 15 Oct; 729 on 14 Oct), for example "ABK's technical sheet for Make (MAKE - Datasheet.pdf, read
  2026-10-14): 8.5 mm; slip resistance R10 (DIN 51130), bare foot B (DIN 51097)." The bare-foot class has no field; it's in the
  note and the data.
- **How an entry fits a sheet line:** its collection, its size (either way round), its thickness (any, when it has none) and its
  finish word. An entry without a finish word fits every finish but R11 (the catalogue names every R11 item), and a sheet given by
  thickness only (Orosei) needs the finish named. The thickness and slip class are set only when every fitting line agrees: Anima
  60x60 without a finish word is 8.5 mm but stays without a slip class, because 60x60 comes in Nat (R10) and Grip (R11).
- **Outdoor floors** (106): every one can be laid the Plein Air catalogue's ways, goes where it says (`driveway`, `steps`,
  `outdoor_shower` added), and notes its packing and, for 63 of the 66 cards (not Orosei's), its special pieces. See
  `surface-material-outdoor-tiles.md`.

`scripts/test-surface-material-physical-scale.ts` checks every Gardenia entry against `findAbkDatasheetMatch`, every sheet note,
every outdoor floor's packing note, and the special pieces' cards, kinds, sizes and codes.

The browser data grows by the filled thicknesses and the outdoor profiles' longer lists (about 10 KB raw in the lazy catalogue
chunk). Slip classes stay in the YAML, as before (`surface-material-runtime-boundary.md`).

## Where ABK's pages and a sheet differ: the catalogue follows the pages (J, 15 Oct 2026)

The sheets in `datasheets.json` keep their own words. Where ABK's colour pages (read 15 Oct 2026) say otherwise, the entries
follow the pages and say so in a note; `scripts/test-surface-material-physical-scale.ts` pins both cases.

- **Gioia.** The sheet covers the nine plain colours: white body wall tiles, BIII, water absorption over 10%, no frost value,
  7 mm. ABK's Gioia page says the seven decors (Majorelle, Martinica, Ombrelle, Palma, Papilio, Primavera, Rossignol) are
  porcelain stoneware, 8.5 mm, and "also suitable for floor installation". So the 12 decor entries are 8.5 mm (the sheet had
  filled 7 mm on 14 Oct), the plain colours stay 7 mm and wall only, and every decor has a floor entry: Martinica's and
  Primavera's were added from ABK's page (J: "Add both floor entries"), on their wall entries' faces; Gardenia's configurator lists
  those two for walls only. 23 entries: 7 floor, 16 wall.
- **La Marmoteca.** Every colour page gives 120x120 and 60x120 as 8.5 mm in every finish it lists, with the note "Current 6 mm
  thickness available while stocks last; to be replaced by the 8.5 mm version." The sheet still lists Lux and Soft at 6 mm (Nat at
  8.5 mm), and ABK uses one item code for both thicknesses. All 125 entries in those sizes are 8.5 mm and note the pages (J: "The
  website: 8.5 mm"): 76 changed from 6 mm, and the sheet's 6 mm note left the 52 it had filled. Marquinia Black 60x120 Nat (2
  entries) was 6 mm from the configurator; at 8.5 mm it fits the sheet's Nat line and takes its R10 and note, like the other Nat
  entries. The 120x280 slabs and the 40x120 Lux (no page) stay 6 mm.

## Where the documents and the catalogue disagree
- Camouflage Plissé White Beton 60x120 (8 mm, 2 entries) isn't on the Camouflage sheet.
- The Plein Air catalogue (January 2026) doesn't list Orosei's six R11 outdoor items (ABK's site does), prints Pietra Viva Aude
  Grey 60x60 under Aude Beige's code 0014519 (the catalogue entry is 0014518), and prints four special-piece codes twice
  (`PLEIN_AIR_SPECIAL_PIECE_CODES_PRINTED_TWICE`): check with ABK before ordering those.
- Hermione's sheet prints its 8.5 mm size as 420x120 (20x120).
