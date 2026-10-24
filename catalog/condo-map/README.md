# Condo map data (admin)

The admin condo map (`/admin/condo-map`) reads its developments from here. Everything in this folder is generated
from the floor-plan masters (`~/Developer/floor-plan-masters`); don't edit it by hand.

- `index.json`: the developments (schema `interior-ai.condo-map.index.v1`).
- `<slug>/map.json`: one development's building in lon/lat for Mapbox (schema
  `interior-ai.condo-map.development.v1`): its storeys' massing, its units' outlines (for picking) and cards, its
  floors' rooms, its balconies, the outline that clears Mapbox's own building off the site, its credits and how it is
  placed.
- `<slug>/plans/`: the pictures on the units' cards.
- `33-residences/models/`: 33 Residences' detailed 3D models (GLB, kept in Git LFS).

`lib/condo-map/condo-map-data.ts` checks every file as it is read, and `npm run test:condo-map` checks the folder is
whole (every plan and model a card or a model list names is here).

## Regenerating

From the masters, with Python 3, NumPy and OpenCV (as the importer uses):

```sh
python3 -I _tools/mapexport/export_condo_map.py . ~/Developer/interior-ai/catalog/condo-map \
  --models 33-residences=_prototypes/build/work/models
```

33 Residences' models are those `_prototypes/build/build.sh` writes to `_prototypes/build/work/models` (its
`models33.py` step). The export is the same every time it runs on the same masters. It adds and replaces files but
doesn't remove any, so delete the development folders first when a plan or model has been renamed or dropped.

## Rights

Only admins can open the map and its data (the page and `/api/admin/condo-map/...` both check). Each development's
`credits` are shown under the map, and must stay with anything shown from here:

- Floor plans and key plans: the developers' brochures (via cos.sg).
- Land lots: "Contains information from SLA Cadastral Land Parcel accessed on 24 Oct 2026 from data.gov.sg which is
  made available under the terms of the Singapore Open Data Licence version 1.0".
- Buildings' outlines from OneMap: "OneMap, © Singapore Land Authority".

No map tiles or satellite pictures are stored here; Mapbox draws the base map in the browser.
