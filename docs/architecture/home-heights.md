# Home heights

How high a home's walls (its ceilings) stand in the app, when the plan doesn't say. J, 30–31 Oct 2026: use these as the
reference when the floor plan or brochure states no height; always check for, and use, a stated height.

## The rules (`lib/home-height-rules.ts`)

| Home | Ceiling | Notes |
|---|---|---|
| HDB flat, BTO or resale | 2.6 m | J, 31 Oct: "include all HDB resale to 2.6 as well" (older resale flats can be 2.4–2.5 m) |
| HDB top-floor unit | 2.75 m | 2.7–2.8 m, with the roof slab and the design |
| Condo | 2.8 m | |
| Condo penthouse | 3.2 m | |
| Strata landed (cluster house, townhouse) | 3.0 m | |
| Unknown | 2.6 m | what the app gave every home before |
| Double volume | EM up to 5 m, HDB loft 4.4–4.8 m | recorded only: a floor has one wall height, so not drawn yet |

- **A stated height wins.** A floor-plan catalog can record what its brochure states, for the whole plan
  (`floor_plan.ceiling_height`) or one layout (`layouts[].ceiling_height`), as `{ value_mm, source_page, quote }`. The
  height is then `source_documented`, with its page, and the app's measured-property rules keep it from being
  overwritten. Without one, the rules' height is `assumed`, and its provenance says which rule gave it.
- **The storey follows the walls:** a storey is the walls plus 200 mm (`STOREY_ALLOWANCE_MM`), as the app's 2.6 m walls
  stood in a 2.8 m storey; a condo's 2.8 m walls get a 3.0 m storey.
- **A layout marked `penthouse: true`** in a condo's catalog gets the penthouse's 3.2 m.

## Where it applies

- **Floor-plan catalogs** (`lib/floor-plan-catalog-v1-adapter.ts`): by the plan's `property_type` (`hdb`, `condo`,
  `executive_condo`, `apartment`, `landed`, `cluster_house`, `townhouse`, …), or the stated height.
- **Templates** (`lib/plan-template-document.ts`): a template tagged `condo` ("Small condo") opens at 2.8 m, one tagged
  `HDB-style` at 2.6 m; any other at the room's current height, as before.
- **Uploaded plans** (the PDF, picture and CAD imports; `lib/floor-plan-imports/review-home-type.ts`): they start at
  2.6 m walls in a 2.8 m storey, marked assumed, and the review asks for the home type (J, 31 Oct 2026: on the review
  step, visible, above the plan's details). Its choices are HDB flat, HDB top floor, Condo, Condo penthouse, Landed and
  Not sure (2.6 m, as before). A choice sets the wall and storey heights by the rules while they are still assumed, and
  says so in their provenance; a height the plan states, or the person typed or confirmed, is kept, and the review says
  which. A storey that changes stands 200 mm over the walls, kept or not. A storey typed in the review keeps its
  assumed evidence and is marked as typed in its provenance, so it is kept after a draft save or a resume too. A home
  type whose walls would be lower than a door or window on the plan changes nothing, and the review says so. The review
  starts on the home type the floor's assumed walls are (2.8 m reads Condo; 2.6 m reads Not sure).
- **The server** (`lib/floor-plan-imports/review.ts`) keeps a home type's wall height assumed, with its own note, so
  choosing a home type doesn't count as confirming it; and a level's height (elevation, storey, slab) the client says
  the plan states is stored as the person's unless the plan stated it already at that value. The choice itself isn't
  stored: the heights it gave are.
- **Not yet:**
  - **A home type for an upload** isn't guessed from the plan, and the review doesn't remember it for the next upload.
  - **A top-floor unit** needs the unit's floor, which a catalog layout doesn't carry.
  - **Raising a floor's walls in the editor** doesn't lift its storey.
  - **Double-volume rooms** need a height per room.
- Product placement's own 2.7 m fallback is never reached (its callers always pass the room's height), and the lighting
  reference page's 3.0 m room is a demonstration; both are left as they are.
