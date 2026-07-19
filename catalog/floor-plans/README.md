# Floor-plan library

Each property or development has its own `catalog.yaml` below this directory. The runtime loader discovers and validates these files for admin review, migration, and golden regression tests. Schema-v1 YAML plans are always `draft` + `review_only`: they are never returned from the consumer `/api/floor-plans` search and cannot be applied in the editor.

Public address results come only from immutable `FloorPlanRevision` database rows that passed the canonical licence, source-overlay, topology, independent-review, and address-binding gates. Do not change a YAML status to simulate approval; schema validation rejects it.

## Add another address

1. Copy `_templates/catalog.yaml.example` into a country/property folder.
2. Give the plan, buildings, layouts, and rooms stable unique IDs.
3. Keep the original source URL and rights status in the catalog.
4. Put small review previews under `public/assets/floor-plans/.../previews/`.
5. Preserve each label printed in the drawing as `source_label`. The runtime derives the consumer room name and type from known source labels; use explicit `name` and `room_type` only for an inferred, unlabeled space.
6. Transcribe editable room dimensions in metres. Use the room centre for `x` and `z`. For a non-rectangular room, use `shape: custom_polygon` and store `plan_polygon` points as local offsets from that centre; `width` and `depth` must match the polygon bounds.
7. Model a doorless shared edge with `kind: opening`. Omit `to_room_id` only for a source-drawn exterior door; never invent an internal target room to satisfy the schema.
8. Keep exterior ledges and structural voids out of consumer room counts. Store them in `reference_zones` with `locked: true` so the 2D starter plan preserves the source footprint without making them furnishable rooms.
9. Do not turn an unlabeled hall, foyer, passage, or dashed suggested zone into a consumer room. Fold genuinely open circulation into the adjoining source-labelled room polygon. Store source-drawn suggestions under `template.annotations` as `suggested_room` or `optional_partition`, give each a `configuration_id`, and keep it non-physical in the default plan.
10. When an official unit list is available, add each building's `unit_distribution` groups. Keep stack numbers quoted, record every residential floor range, and map the group to one or more layout IDs.
11. Use `status: verified` only when every layout for that building is mapped and the calculated unit totals match the source. Use `partial` while transcription is incomplete.
12. Record the official unit-list URL in `unit_distribution_source` and its PDF/brochure page numbers on each building.
13. Mark brochure tracings as approximate even when the block, stack, and floor mapping is verified.
14. Keep `publication.status: draft` and `publication.visibility: review_only`, even when the fixture geometry is useful. `source.license_status` must describe known evidence and must never be upgraded by assumption.
15. Run `npm run test:floor-plan-library` before submitting the fixture for review.
16. If the source supplies complete alternative layouts, put them in a shared layout-level `configuration.group_id`. Give the default option `default_selected: true` and every materialized alternative its own `option_id`. Selecting a non-default layout is the explicit action that may create its separately authored rooms and walls; an annotation alone never does so.

Internal reviewers can use the review-only resolver to check addresses such as `Block 810A Chai Chee St #12-509`. When a building has unit-distribution data, a valid unit query is narrowed to only the mapped fixture or variants; an unknown stack or unavailable floor does not fall back to broad block results. Admins can inspect fixture previews and source links under `/admin/floor-plans`.

To make a plan consumer-searchable, ingest its source through the floor-plan import queue, resolve every critical review issue, confirm redistribution rights, approve the canonical revision, and publish its independently evidenced address bindings. The public API fails closed if the canonical revision store is unavailable; it never falls back to YAML.

Source PDFs should stay external unless redistribution rights are confirmed. The preview is a reference; the generated editor rooms are for early space planning, not construction or fabrication.
