# Outdoor tiles in the catalogue

J (13 Oct 2026): "look at on their website on the use case for outdoor tiles and teach it into the system for my webapp so in the
future when the AI is stronger it is able to reconise and use it". J's choice: **knowledge in the catalogue**. Every outdoor floor
tile carries where it goes, how it can be laid and its indoor twins; a search for a terrace or a pool finds outdoor tiles; the
manufacturer's words are kept, with their sources, in `lib/surface-material-outdoor-knowledge.ts`. The app's AI doesn't read any of
it yet, and the app has no outdoor room type yet (balcony is the vocabulary's outdoor room).

## What the manufacturer says (read 13 Oct 2026)

| Source | What it says |
| --- | --- |
| [ABK, Plein Air](https://www.abkgroup.it/en/gardeniaariana/floor-and-wall-tiles/plein-air/) | Gardenia&Ariana's outdoor range: porcelain stoneware, finish R11, 20 mm, in 80x80, 60x120, 60x90, 60x60 and 30x120. It "transfers the material sensations of Gardenia&Ariana's main ceramic tile collections to exterior spaces", with "coordinated finishing elements". 70 colours: Gardenia&Ariana colours (Anima, Camouflage, Dorica, Falaise, Hermione, La Geoteca, Make, Orosei, Pietra Viva, Storm, Tabulae) and twelve ranges of its own (Belgian Stone, Concept Stone, Legend, Livingstone, Mineral, Native, Nimbus, Rayé, Salento, Travertine, Urban, Warehouse). |
| [Gardenia blog: the Gardenia collections](https://blog.gardenia.it/en/outdoor-tiles-here-are-the-gardenia-collections) | Outdoor tiles go "from the terrace to the balconies, from the paths to the gardens, from the patio to the pool". Native (Sand, Mud, Silver, Concrete) is for indoors and outdoors and can be laid four ways: glued on a screed, dry on grass, dry on gravel or sand, or raised. Concept Stone is the other range shown. |
| [Gardenia blog: everything you need to know](https://blog.gardenia.it/en/outdoor-tiles-everything-you-need-to-know) | Where the floor is (a covered patio, a pool edge, a sloping ramp, a balcony, a terrace) decides the tile. Slip resistance matters; tiles are tested for it (DIN 51130 shod, DIN 51097 bare foot, ANSI A137.1.2012, ASTM C1028, BCRA). Porcelain stoneware doesn't absorb water and copes with low temperatures, hail, snow and ice. Lay it with a slope for rainwater and with elastic joints. |
| [Gardenia blog: how to choose](https://blog.gardenia.it/en/how-to-choose-the-right-outdoor-tiles-style-color-materials-and-dimensions) | Not every porcelain stoneware tile can go outdoors. Neutral colours (sand, brick, burnished) suit the outdoors; white near a pool brings out the water's blue; avoid very bright or artificial colours. Stone or stone-effect tiles for a garden. Large formats make a small area look wider; a large area can mix large and smaller sizes. The outdoor floor should suit the whole house. |
| [ABK, the Rooms filter](https://www.abkgroup.it/en/gardeniaariana/floor-and-wall-tiles/api/advanced-search/?ambiences__settings=outdoor) | ABK's rooms: bathroom, bedroom, commercial spaces, hotel & spa, kitchen, living room, outdoor, restaurants. "Outdoor" lists 17 colours: 12 Plein Air ones and five indoor tiles of 6 to 8.5 mm (Tabulae Refined Fieno 20x120, I Pigmenti Cream 120x120, Dorica Crema 60x120, La Geoteca Bourgogne Beige 120x280, Anima Grigio 60x120), three of which the Plein Air photos' captions name next to a Plein Air tile. So the filter lists the tiles in ABK's outdoor photos; it doesn't say a tile can go outside. |

ABK's Plein Air datasheet and catalogue (the download area's PDFs) were not read: downloading them needs J's OK. They may say how
the other ranges can be laid, give test values, and list the finishing pieces (steps, edges).

## What an outdoor floor carries

An outdoor floor is a floor entry with `physical_specs.suitable_for_outdoor: true`: 106 today, all Gardenia&Ariana's Plein Air
items (43 outdoor sizes of catalogued colours added on 13 Oct, 13 the July import had filed, 50 of Plein Air's own ranges), all 20
mm, `slip_rating: R11`, with balcony among their rooms.

In the YAML (the source of truth):

- `classification.outdoor_uses`: where it goes, from the vocabulary `outdoor_use`: `terrace`, `balcony`, `patio`, `garden`, `path`,
  `pool_edge`. Every outdoor floor has all six, the places Gardenia names for its outdoor tiles; nothing narrower is sourced.
- `physical_specs.installation_method`: how it can be laid. Plein Air Native's seven entries add `dry_lay_on_grass`,
  `dry_lay_on_gravel_or_sand` and `raised_installation` to `direct_stick` (glued), the four ways Gardenia names for Native; each
  notes the source. The other outdoor tiles keep `direct_stick` until a source says more.

`scripts/generate-surface-material-runtime.ts` refuses an outdoor floor without outdoor uses, outdoor uses on anything but an
outdoor floor, a use outside the vocabulary, and the outdoor-only laying on an indoor tile (`getSurfaceMaterialOutdoorFailures`).

In the browser data (`lib/generated/surface-material-catalog.generated.ts`), each outdoor floor has `classification.outdoor`:

```json
{ "uses": ["terrace", "balcony", "patio", "garden", "path", "pool_edge"],
  "laying": ["direct_stick"],
  "indoor_twin_ids": ["gardenia-flooring-dorica-avorio-0009999-120x280-nat-196266-0", "..."] }
```

**Indoor twins** are the same colour's indoor floor entries: the other sizes on the outdoor tile's card (same maker, collection,
look, colour family and name before the size). The generator works them out (`buildSurfaceMaterialOutdoorProfiles`), so they can't
drift from the catalogue; `test-surface-material-physical-scale.ts` checks they are exactly the card's indoor sizes. 55 outdoor
floors have twins. The other 51 have none in the catalogue: Plein Air's own ranges (Native, Mineral and the rest aren't
Gardenia&Ariana collections; ABK's collection list, 13 Oct 2026) and La Geoteca Antracite, a colour La Geoteca has only outdoors.

## Search

The Surfaces search finds an outdoor floor by "outdoor" and by where it goes ("terrace", "patio", "pool", "balcony", "path"), and
Native by its laying ("grass", "gravel", "raised"). A search for "garden" finds every Gardenia tile, as it always has: the word is in
the brand's name.

## ABK's rooms and the app's

`ABK_ROOM_FILTER_TO_SURFACE_ROOM` maps ABK's rooms to the vocabulary's: living room to `living_room`, hotel & spa and restaurants
to `hospitality`, commercial spaces to `commercial`, outdoor to `balcony`, and bathroom, bedroom and kitchen to themselves.

## Indoor and outdoor in ABK's photos

Five of ABK's Plein Air photos name an indoor tile with the outdoor one (`SURFACE_OUTDOOR_PAIRINGS`, with the catalogue card of
each):

| Outdoor (20 mm R11) | Indoor, in the same photo |
| --- | --- |
| Dorica Avorio 60x120 | Dorica Crema 60x120 Antique 3D, 8.5 mm |
| La Geoteca Bourgogne Beige 80x80 | La Geoteca Bourgogne Beige 120x280 and 120x120 Nat P.tech, 6 mm |
| Anima Grigio 60x120 | Anima Grigio 60x120 Nat P.tech, 8.5 mm |
| Hermione Miel 30x120 | Gioia Palma 60x120 Natural, 8.5 mm |
| Tabulae Genuine Havana 30x120 (card "Tabulae Genuine Hav") | Orosei Cream 120x280 Natural, 6 mm |

## What the data answers

- Can this tile go outside? `suitable_for_outdoor` (only Plein Air's 20 mm R11 items say yes).
- Where? `outdoor.uses`. How can it be laid? `outdoor.laying` (beyond glue, only Native's is sourced).
- What goes indoors next to it? `outdoor.indoor_twin_ids`, and ABK's photo pairings.
- What should a buyer know? `SURFACE_OUTDOOR_FACTS`: slip resistance and its tests, slope and joints, colour and size advice, each
  with its source.

## The nine split on 13 Oct 2026

The July configurator import had filed nine outdoor items together with an indoor item (Dorica Avorio and Crema 60x120, Pietra
Viva Aude Beige and Grey 80x80, Camargue Beige and Ivory 60x120 and 80x80, Limoges Sand 80x80). J (13 Oct 2026): split them. Each
July entry keeps its id and name and is now the indoor item (8.5 mm); the outdoor item has an entry of its own, named R11, with the
outdoor fields above. Details in `surface-material-tile-faces.md`.
