# Floor-plan library

Each property or development has its own `catalog.yaml` below this directory. The runtime loader discovers those files recursively, validates them, and exposes published layouts through `/api/floor-plans?q=<address>`.

## Add another address

1. Copy `_templates/catalog.yaml.example` into a country/property folder.
2. Give the plan, buildings, layouts, and rooms stable unique IDs.
3. Keep the original source URL and rights status in the catalog.
4. Put small consumer previews under `public/assets/floor-plans/.../previews/`.
5. Preserve each label printed in the drawing as `source_label`. The runtime derives the consumer room name and type from known source labels; use explicit `name` and `room_type` only for an inferred, unlabeled space.
6. Transcribe editable room dimensions in metres. Use the room centre for `x` and `z`. For a non-rectangular room, use `shape: custom_polygon` and store `plan_polygon` points as local offsets from that centre; `width` and `depth` must match the polygon bounds.
7. Model a doorless shared edge with `kind: opening`. Omit `to_room_id` only for a source-drawn exterior door; never invent an internal target room to satisfy the schema.
8. Keep exterior ledges and structural voids out of consumer room counts. Store them in `reference_zones` with `locked: true` so the 2D starter plan preserves the source footprint without making them furnishable rooms.
9. Do not turn an unlabeled hall, foyer, passage, or dashed suggested zone into a consumer room. Fold genuinely open circulation into the adjoining source-labelled room polygon.
10. When an official unit list is available, add each building's `unit_distribution` groups. Keep stack numbers quoted, record every residential floor range, and map the group to one or more layout IDs.
11. Use `status: verified` only when every layout for that building is mapped and the calculated unit totals match the source. Use `partial` while transcription is incomplete.
12. Record the official unit-list URL in `unit_distribution_source` and its PDF/brochure page numbers on each building.
13. Mark brochure tracings as approximate even when the block, stack, and floor mapping is verified.
14. Run `npm run test:floor-plan-library` before publishing.

Consumers can enter `Block 810A Chai Chee St #12-509` or `Unit 12-509`. When a building has unit-distribution data, a valid unit query is narrowed to only the mapped editable layout or variants; an unknown stack or unavailable floor does not fall back to broad block results.

Source PDFs should stay external unless redistribution rights are confirmed. The preview is a reference; the generated editor rooms are for early space planning, not construction or fabrication.
