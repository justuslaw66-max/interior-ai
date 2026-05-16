# Dawson Reference Intake

Put the raw Dawson upholstery reference images in this folder using the exact filenames below.

Path for raw images:

- `incoming/dawson-reference/originals/`

## Simple Version

You need to take each Dawson reference image you have saved on your Mac and place a copy of it into this folder:

- `incoming/dawson-reference/originals/`

Then rename each file so it matches the list below exactly.

Example:

- if you have the Indigo reference saved somewhere on your Mac, copy it into `incoming/dawson-reference/originals/`
- rename it to `indigo-blue.jpg`

## How To Do This In VS Code

1. In the VS Code file explorer, open `incoming/dawson-reference/originals/`
2. Drag your saved image files from Finder into that folder
3. In VS Code, right-click each uploaded file and rename it to the exact filename from the list below

## How To Do This In Finder

1. In Finder, open your project folder
2. Open `incoming/dawson-reference/originals/`
3. Copy your saved Dawson reference images into that folder
4. Rename each copied file so it matches the exact filenames below

## What If Your Files Are PNG Instead Of JPG

That is fine.

You can either:

- rename them with `.png` and tell me, or
- leave them as `.png` and I will adapt the conversion step

## What You Need To Gather

You need 11 source images total, one for each Dawson upholstery option.

If you do not have all 11 yet, start with the ones you already have. I can still help in batches.

## Required Raw Reference Files

- `incoming/dawson-reference/originals/navagio-seagull.jpg`
- `incoming/dawson-reference/originals/performance-creamy-white.jpg`
- `incoming/dawson-reference/originals/indigo-blue.jpg`
- `incoming/dawson-reference/originals/marcel-brilliant-white.jpg`
- `incoming/dawson-reference/originals/peyton-ivory.jpg`
- `incoming/dawson-reference/originals/peyton-dove-grey.jpg`
- `incoming/dawson-reference/originals/marcel-smoke-grey.jpg`
- `incoming/dawson-reference/originals/peyton-moss.jpg`
- `incoming/dawson-reference/originals/peyton-cumin.jpg`
- `incoming/dawson-reference/originals/infinity-boucle-ginger.jpg`
- `incoming/dawson-reference/originals/infinity-boucle-white-quartz.jpg`

## Mapping To Dawson Upholstery Codes

- `navagio-seagull.jpg` -> `navagio_seagull`
- `performance-creamy-white.jpg` -> `performance_creamy_white`
- `indigo-blue.jpg` -> `indigo_blue`
- `marcel-brilliant-white.jpg` -> `marcel_brilliant_white`
- `peyton-ivory.jpg` -> `peyton_ivory`
- `peyton-dove-grey.jpg` -> `peyton_dove_grey`
- `marcel-smoke-grey.jpg` -> `marcel_smoke_grey`
- `peyton-moss.jpg` -> `peyton_moss`
- `peyton-cumin.jpg` -> `peyton_cumin`
- `infinity-boucle-ginger.jpg` -> `infinity_boucle_ginger`
- `infinity-boucle-white-quartz.jpg` -> `infinity_boucle_white_quartz`navagio-seagull.jpg

## Source Image Guidance

- Keep the full original image if it includes both texture and label text.
- Do not crop before dropping files in; the conversion step can do that.
- Prefer the highest-resolution version available.
- JPG is fine; PNG is also acceptable if needed.

## Next Step After Files Are Added

Once these 11 raw files are present, the next conversion pass will generate:

- swatches in `public/swatches/dawson/`
- close-up previews in `public/materials/dawson/`
- base color maps in `public/pbr/dawson/<option>/`
- shared fabric normal and roughness maps ![alt text](peyton-dove-grey.jpg)in `public/pbr/fabrics/<family>/`![alt text](infinity-boucle-white-quartz.jpg)![alt text](navagio-seagull.jpg)![alt text](marcel-smoke-grey.jpg)![alt text](performance-creamy-white.jpg)![alt text](peyton-moss.jpg)![alt text](indigo-blue.jpg)![alt text](peyton-cumin.jpg)![alt text](marcel-brilliant-white.jpg)![alt text](infinity-boucle-ginger.jpg)![alt text](peyton-ivory.jpg)