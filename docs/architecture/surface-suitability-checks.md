# Plan review's surface checks (17 Oct 2026)

J, 17 Oct 2026, chose "Build all five" checks and "Yes, add balcony". Plan review checks each room's floor and walls against what the room is for, using the tile facts from ABK's technical sheets (`surface-material-abk-documents.md`). They are advice: every finding is a `tip` in the new `surfaces` category, with the action `review_surface`. They don't change the score or the label.

## The checks (`lib/floor-plan-surface-checks.ts`)

| # | Room | Finding | Source in the message |
| --- | --- | --- | --- |
| 1 | Bathroom (`toilet`) floor | R9 (DIN 51130) | Workplace washrooms and showers need R10 (ASR A1.5) |
| 2 | Bathroom floor | Barefoot class without B (DIN 51097), or the sheet doesn't settle one slip class for the entry | Shower areas need barefoot B (DGUV 207-006) |
| 3 | Any floor | The sheet calls it a white-body wall tile (EN 14411 group BIII, water absorption over 10%) | ABK's sheet |
| 4 | Balcony floor | Not in ABK's outdoor range (no `classification.outdoor_uses`), or not a catalogue tile at all | Outdoor paths need R11 (ASR A1.5); ABK's outdoor tiles are R11 and 20 mm |
| 5 | Balcony walls | Any wall, face or panel in a white-body wall tile | ABK's sheet: over 10% water absorption |

- **Private homes aren't regulated.** The R10, R11 and barefoot B levels are the German workplace rules', which tile makers use as the reference (Villeroy & Boch's "Tech Info: slip resistance" lists them and says private areas aren't subject to them). Every message says so.
- **No guesses.** A floor with no facts (the starter floors, the legacy `FLOOR_MATERIALS`, other suppliers) gets no bathroom finding. On a balcony, any floor that isn't in ABK's outdoor range is flagged.
- **No kitchen check.** The rules only cover commercial kitchens (R12).
- **Check 3 flags no floor entry today.** Gioia's floor entries are its porcelain decors, which ABK's Gioia page says suit floors. Its nine white-body plain colours are wall tiles, and floors only take floor entries. The check guards a stored id or a future entry.
- Published entries the checks can flag: 14 R9 floors, 23 floors with a barefoot class without B, 87 floors whose sheet doesn't settle a slip class, 9 white-body wall tiles. 106 floors are in ABK's outdoor range. `scripts/test-floor-plan-surface-checks.ts` pins these counts.

## Where the facts come from

- `lib/surface-material-suitability-source.ts` builds each entry's facts at generation time:
  - the slip class: the YAML's `physical_specs.slip_rating`, else the sheet's;
  - the barefoot class and the sheet's collection, from `findAbkDatasheetMatch`;
  - an outdoor floor: `classification.outdoor_uses` is set;
  - a white-body wall tile: the sheet's group is BIII.
- `scripts/generate-surface-material-runtime.ts` writes them as the render tuple's trailing field 34, `[slip, barefoot, sheet, flags]`, only for entries with a fact.
- `lib/surface-material-suitability.ts` decodes them into `SurfaceMaterialRenderRecord.suitability`.
- App code never imports ABK's sheets or the source module. The test checks that.
- **Why the eager render data:** plan review runs synchronously for any saved design, and the lazy catalogue loads only with the surface browser. The facts add about 29 KB raw (about 1.2 KB gzip) to `surface-material-render.generated.ts`. See `surface-material-runtime-boundary.md`.

## Wiring

- `useDesignPagePlanQualityController` wraps `buildFloorPlanQualityReport` in `withSurfaceSuitabilityIssues`. This appends the tips after the plan's own issues, and returns the same report when there are none.
- `FloorPlanQualityCategory` gains `surfaces`, and the scored categories are `FloorPlanQualityScoredCategory`. `categoryScores` is keyed by those, so surfaces have no score.
- `review_surface` routes like `review_plan_layout`:
  - it goes to Plan in 2D and selects the room;
  - its toast is "Check the highlighted room's finishes";
  - the Plan card labels it "Review surfaces".
- The routing moved out of the hook into `routePlanQualityAction`, unchanged for the other actions.

## The balcony room type

- `RoomType` gains `balcony`. `ROOM_TYPE_LABELS` is the one list of labels ("Balcony"), and `HOUSE_ROOM_TYPES` is built from it in the pickers' order.
- Every room-type picker offers it.
- **Shares:** they keep it (`shared-design-snapshot.ts`).
- **Cabinetry:** it has no balcony templates, so it treats a balcony as a custom room.
- **The floor-plan library format** (`design-snapshot-v3-floor-plan-adapter.ts`) has no balcony room type, so a design's balcony is written there as a custom room.
- **AI layout:** it already supports only living rooms, so a balcony is unsupported there, like a kitchen.
- Saved designs only require a non-empty room type, so nothing on the server changes.
- **Not done:**
  - imports still turn a BALCONY label into a custom room (`toLegacyRoomType`);
  - there is no balcony tile among "add one room";
  - there is no outdoor default floor for a new balcony, so a new balcony starts with the check 4 tip.

## AI notes: the room's surfaces and checked floor swaps (18 Oct 2026)

J, 18 Oct 2026, step 2 of the AI tile plan: "Floors only", "Allow finishes alone", and fix the item data in the same PR.

- **What the page sends** (`lib/ai/design-notes-request.ts`): the active room's id, name, type, floor material id and wall, face and panel material ids (`toSurfaceCheckRoom`), with its products (instance id, product id, name, category, quantity, unit price, size in metres). The contract parses the room strictly (`parseDesignNotesRoom`); one outside it is dropped.
- **What the model is told** (`describeDesignNotesRoom`, `lib/ai/design-notes-prompt.ts`): the floor's and walls' facts, looked up by the server in its own render data (slip class, barefoot class, sheet, outdoor range, white-body wall tile), plan review's surface findings, and up to three floor swap candidates. The system prompt repeats that homes aren't regulated and that a swap may name only a candidate.
- **Candidates** (`lib/surface-floor-swaps.ts`): published catalogue floors, not the one laid, that the room's floor checks don't flag, and whose sheet says positively that they suit the room:
  - a bathroom floor is R10 or more and barefoot B (275 published floors today);
  - a balcony floor is in ABK's outdoor range (106);
  - any other room's floor has a sheet that doesn't make it a white-body wall tile.
  - A floor with no facts never qualifies. A room whose floor isn't flagged gets none. The nearest come first: the same ABK collection, then the same colour family, then the same size.
- **SWAP_SURFACE** `{ roomId, surface: "floor", materialId, fromMaterialId }`. The server keeps one only when it names the room and one of its candidates, for fresh and cached notes alike (`parseCheckedDesignNotes`), and sets `fromMaterialId` to the floor it replaces. Walls are never swapped; their findings are only explained.
- **Applying** (`lib/ai/design-notes-editor.ts`): the page checks the swap again against the active room as it is now (`floorSwapProblem`): the same room, the same floor as when the notes were made, and a tile that still qualifies. Then the surface workspace's `applyFloorMaterialToRoom` lays it: one undo step, its toast and its `floor_finish_applied` event. Applying stays Pro's, like the other suggestions.
- **Finishes alone:** AI notes runs when the room has products or a floor or wall from the tile catalogue; the starter floor doesn't count. The section says "Add products or a floor or wall finish to the room first."
- **Without an AI provider** the fallback offers the nearest candidate for a flagged floor, and the furniture suggestions only when the room has products.
- **Tests:** `scripts/test-ai-design-notes.ts` (`test:ai-design-notes`, in `test:critical-required`).
