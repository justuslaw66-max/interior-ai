# Blind A/B harness for the clean drawing (faithful trace)

This compares two versions of the clean 2D drawing on the same pages, judged by graders who never learn which version
is which. It was rebuilt on 30 Oct 2026; the first version (`/root/t44`) was lost with its cloud folder.

1. Trace each page with each version (`faithful_drawing.py <page> <out.json>`). Draw each result as the app draws it:
   `ab_render.py <drawing.json> <run>/<id>.png --width=W --height=H` (nonzero fills, butt caps, the trace's tones,
   rendered by Chromium).
2. Make the packs: `ab_pairs.py --list=list80.txt --originals=<dir> --run1=<dir> --run2=<dir> --names=r12,r13d
   --out=<dir>`. Each grader gets a folder of pages (ORIGINAL | A | B, the whole page and its two halves), with A and B
   in a seeded random order. The key is written beside the folders, never in them.
3. Give each grader (an independent agent with no other context) only `prompt.md` and its own folder, and have it
   write `replies/g<k>.json`.
4. `ab_tally.py --key=<out>/key.json --replies=<out>/replies` gives each version's wins (clear ones apart), the ties,
   and the split by group (web s-plans, brochure pages, dev and HDB).

`list80.txt` holds the 80 real uploads from the 24 Oct study: 68 pictures and 12 brochure pages, no sealed plan. The
brochure pages are rendered from their PDFs as the live app renders them (pdf.js).

## The plan drawn from the model (workstream 2, 8 Nov 2026)

`model_drawing.ts <evidence.json> <faithful.json|-> <out.svg>` draws the other side: the clean plan the review draws
from the document (`lib/floor-plan-review-plan-drawing.ts`), with the page's faithful trace supplying the fixtures it
keeps; render the SVG with Chromium at the page's size. A page with nothing to draw the plan from is drawn by the
faithful trace, as the review does. Grade it with `prompt-redrawn.md`: the same task, but neutral between a traced copy
and a redrawn one (typed names, standard symbols), and asking for things in the wrong place as well as missing ones.

First run, 8 Nov (63 of the 80 pages; the 17 others were not in the cloud copy): r12 better on 62, the same on 1,
the model drawing better on none. Its defects were mostly the model's (rooms merged or named in the wrong room,
walls missing or moved, doors misplaced); the drawing's own were fixtures against a wall left out, small dimension
figures and stray traced letters. So r12 stays the review's first view (`claude/handoff-2026-11-08-model-drawing.md`).
