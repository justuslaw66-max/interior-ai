# Condo map data (admin)

The admin condo map (`/admin/condo-map`) reads its developments from here. Everything in this folder is generated
from the floor-plan masters (`~/Developer/floor-plan-masters`); don't edit it by hand.

- `index.json`: the developments (schema `interior-ai.condo-map.index.v1`).
- `<slug>/map.json`: one development's building in lon/lat for Mapbox (schema
  `interior-ai.condo-map.development.v1`): its storeys' massing, its units' outlines (for picking) and cards, its
  floors' rooms, its balconies, the outline that clears Mapbox's own building off the site, its credits and how it is
  placed.
- `<slug>/plans/`: the pictures on the units' cards.
- `<slug>/models/`: each development's detailed 3D models (GLB, kept in Git LFS): every development has them since
  28 Oct 2026 (until then 33 Residences only, the others grey massing).

`lib/condo-map/condo-map-data.ts` checks every file as it is read, and `npm run test:condo-map` checks the folder is
whole (every plan and model a card or a model list names is here).

## Regenerating

From the masters, with Python 3, NumPy and OpenCV (as the importer uses):

```sh
python3 -I _tools/mapexport/export_condo_map.py . ~/Developer/interior-ai/catalog/condo-map \
  --only 10-evelyn,183-longhaus,19-nassim,1919,1953,21-richards,24-one-residences,32-gilstead,33-residences \
  --models 33-residences=_prototypes/build/work/models \
  --models 10-evelyn=sg/condo/10-evelyn/models3d --models 183-longhaus=sg/condo/183-longhaus/models3d \
  --models 19-nassim=sg/condo/19-nassim/models3d --models 1919=sg/condo/1919/models3d \
  --models 1953=sg/condo/1953/models3d --models 21-richards=sg/condo/21-richards/models3d \
  --models 24-one-residences=sg/condo/24-one-residences/models3d --models 32-gilstead=sg/condo/32-gilstead/models3d
```

`--only` names the developments on the map: the bulk import's packages are in the masters too, and are not on it
(28 Oct 2026). A new development joins the map by its slug here.

A development whose package says `"directory": {"listed": false}` isn't exported (12 On Shan, from 25 Oct 2026: J
took it off the directory and the map); remove its folder here when one is taken off.

The models: 33 Residences' are those `_prototypes/build/build.sh` writes to `_prototypes/build/work/models` (its
`models33.py` step); every other development's are those the masters' `_tools/models3d/build_models.py` writes to its
package's `models3d/` (see that folder's README: each development's look and drawing convention are in its package's
`geo/models3d-config.json`). The export is the same every time it runs on the same masters. It adds and replaces files but
doesn't remove any, so delete the development folders first when a plan or model has been renamed or dropped.

## Rights

Only admins can open the map and its data (the page and `/api/admin/condo-map/...` both check). Each development's
`credits` are shown under the map, and must stay with anything shown from here:

- Floor plans and key plans: the developers' brochures (via cos.sg).
- Land lots: "Contains information from SLA Cadastral Land Parcel accessed on 24 Oct 2026 from data.gov.sg which is
  made available under the terms of the Singapore Open Data Licence version 1.0" (32 Gilstead's lot was accessed on
  25 Oct 2026; the page shows the credit once, with both dates).
- Buildings' outlines from OneMap: "OneMap, © Singapore Land Authority".

No map tiles or satellite pictures are stored here; Mapbox draws the base map in the browser.
