# Floor-plan vectorizer (worker-side Python)

Run by `PythonFloorPlanVectorizerProvider` (`lib/floor-plan-imports/vectorizer-evidence.ts`) on one rendered plan page:

    python3 floorplan_vectorize.py page.png out/page --px-size     # image → model JSON (+ SVG, cleaned work image)
    python3 app_evidence.py out/page.json out/page.evidence.json   # model → evidence in the import pipeline's types

With the faithful trace on (`FLOOR_PLAN_FAITHFUL_TRACE=1`) a third program runs after them, on the page itself:

    python3 faithful_drawing.py page.png out/page.faithful.json --max-pixels=4000000   # clean page → the faithful drawing

See "The faithful trace" below.

Off unless `FLOOR_PLAN_VECTORIZER_ENABLED=1`. Other settings: `FLOOR_PLAN_VECTORIZER_DIR` (default
`<cwd>/services/floorplan-vectorizer`), `FLOOR_PLAN_VECTORIZER_PYTHON` (default `python3`),
`FLOOR_PLAN_VECTORIZER_TIMEOUT_MS` (default 420000, 10 s – 15 min), `FLOOR_PLAN_VECTORIZER_EXPORT_FLOOR_MS` (the least
`app_evidence.py` gets after `floorplan_vectorize.py`, default 60000, 10 s – 5 min), `FLOOR_PLAN_VECTORIZER_MAX_PAGES` (default 1).

## Setting up and checking, in three steps

OpenCV 5 returns several results in a different shape; the programs were built and measured on OpenCV 4 and refuse to
start on 5. Use the pinned versions in a virtual environment (the `tesseract` program must also be installed):

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

1. Python alone: the two commands above with `.venv/bin/python3` (add `--check=out/check.png --source=page.png` to the
   second to get a picture of the rooms found).
2. Through Node, without the app, database or worker — the real provider, then the adapter's own scale, topology and
   validation stages, then the canonical validator and compiler. Run from the repository root:

       FLOOR_PLAN_VECTORIZER_PYTHON=$PWD/services/floorplan-vectorizer/.venv/bin/python3 npm run floor-plan:vectorizer -- /path/to/plan.png

3. A full import in the app with `FLOOR_PLAN_VECTORIZER_ENABLED=1` and the same `FLOOR_PLAN_VECTORIZER_PYTHON` set for
   the process that runs imports.

## On the machine that runs imports

The programs run wherever imports are processed: the floor-plan worker (`npm run worker:floor-plans`,
`FLOOR_PLAN_PROCESSING_MODE=background`, the production default) or the app process itself in `inline` mode. That
machine needs, in the worker's working directory (the repository checkout the worker runs from):

- this folder, with a Python 3.9+ virtual environment built from `requirements.txt` (OpenCV **4**; `opencv-python-headless`
  is pinned `<5`, and the program refuses to start on 5), scikit-image and pytesseract;
- the `tesseract` program with the English data on the worker's `PATH` — Debian/Ubuntu
  `apt-get install -y tesseract-ocr tesseract-ocr-eng`, macOS `brew install tesseract`. Any 4.x or 5.x runs, but the
  release decides what is read: the scores were measured with the 5.3 line (Debian bookworm's 5.3.0, Ubuntu 24.04's
  5.3.4). With the same programs and the same `eng.traineddata`, 5.5.3 (Homebrew, October 2026) read 122 of the
  corpus's 138 rooms where 5.3.0 read 126 — room labels and printed numbers go unread, and rooms, doors and windows
  follow the labels. A machine that must read like the measured one sets `FLOOR_PLAN_VECTORIZER_TESSERACT=5.3` (the
  worker image does), and the doctor then fails on any other release line; without it the doctor only warns;
- the settings on that process: `FLOOR_PLAN_VECTORIZER_ENABLED=1`, `FLOOR_PLAN_VECTORIZER_PYTHON=<absolute path to
  .venv/bin/python3>`, and only if the folder is elsewhere `FLOOR_PLAN_VECTORIZER_DIR`; `FLOOR_PLAN_VECTORIZER_TIMEOUT_MS`
  if 7 minutes per page is not right for the machine (the worker renews its lease while the programs run).

Hosts that run only the Next.js app (Vercel functions) cannot run this: no persistent process, no `tesseract`. Leave
the flag unset there; in `background` mode the app process never runs imports anyway.

There is no production worker yet (26 Sep 2026): the app on Vercel cannot host one. `worker.Dockerfile` in this folder
builds one — Node 24, the pinned venv, `tesseract` + English data (pinned to the 5.3 line through the doctor), the
worker as the command, and the doctor at build time so a broken runtime, or another OCR engine, does not build:

    docker build -f services/floorplan-vectorizer/worker.Dockerfile -t interior-ai-floor-plan-worker .
    docker run --rm --env-file .env.worker interior-ai-floor-plan-worker                                   # imports
    docker run --rm --env-file .env.worker interior-ai-floor-plan-worker npm run worker:floor-plan-deletions   # deletions

`.env.worker` is the app's server environment (`DATABASE_URL` for the same database the app writes to, `APP_ENV`
= `production` or `staging`, the `FLOOR_PLAN_*` storage settings the app uses, `OPENAI_API_KEY` / `FLOOR_PLAN_VISION_*`
if the vision pass is on); the image already sets `FLOOR_PLAN_PROCESSING_MODE=background` and the three vectorizer
settings. The app side must run with `FLOOR_PLAN_PROCESSING_MODE=background` too (the production default), so that
requests enqueue and this process, not the request, does the work. One container is enough: the vectorizer is single-
threaded per plan and the worker processes one job at a time; start it with 2 CPUs and 2 GB and watch the run times (32 s – 6 min per plan on 2 cores in the sandbox).

`doctor.py` checks all of it and must be run with the interpreter the worker will use:

    services/floorplan-vectorizer/.venv/bin/python3 services/floorplan-vectorizer/doctor.py --run

One line per check (interpreter and the `FLOOR_PLAN_VECTORIZER_*` settings as the shell has them, numpy / OpenCV 4 /
scikit-image / pytesseract, the `tesseract` program, its version, whether that is the measured release line (a
warning, or a failure where `FLOOR_PLAN_VECTORIZER_TESSERACT` pins one) and English data, a digit read the way the tracer
asks for one, both programs present, the temporary folder); `--run` also traces a small drawn plan through both
programs the way the worker runs them (about half a minute) and expects its rooms, a `BEDROOM` label and a scale of
10 mm per pixel back; `--run=/path/to/plan.png` traces a real plan instead and reports what came out. It ends with
`RESULT: READY` and exit code 0, or `RESULT: N FAILED`. Run it as the worker's user, with the worker's environment
(`env $(cat .env.production | xargs) …` or from the same service definition), since PATH and the settings are what it checks.

When the runtime is missing or a program fails, an import still completes from the other evidence sources: the
provider fails soft, the page's diagnostics carry `vectorizer.status: "failed"` with the last line the program wrote,
and its notes say `Local vectorizer unavailable: …` (a missing interpreter reads `spawn … ENOENT`; a missing
`tesseract` reads `the tesseract program is not on PATH …`). `npm run test:floor-plan-vectorizer-evidence` covers both.

## The faithful trace

`faithful_trace.py` (version r12) copies a clean plan as it is drawn, as clean vectors: solid fills as polygons, every
line, arc and dot at its own width and grey, lettering and small marks by their outline. It reads nothing as a room, a
door or a wall. `faithful_drawing.py` runs it on the page and writes it in the evidence's `drawing` form
(`version: "faithful-trace-r12"`, items with a `tone`, no `textBoxes`); the provider puts it in place of stage 1's
drawing, and the app draws it as the page's traced drawing as it is (`faithful-trace-v1`: nothing is moved against the
picture or traced from it beside it). Stage 1's rooms, walls, doors, scale and the rest of the evidence are unchanged.

- Off unless `FLOOR_PLAN_FAITHFUL_TRACE=1` on the process that runs imports (with the vectorizer on).
- Only dark ink on light paper (a plan drawn light on a dark ground traces as one black sheet) and a picture that is not
  blurred (stage 1's own softness measure, at most 1.4: a blurred scan or photo is left). A picture that is only soft,
  without solid black (a low-resolution JPEG plan enlarged into a brochure page), is traced (J, 24 Oct). Since r8 its
  lettering is copied letter by letter where it runs together or into the lighter line work under it (a room's name
  on its floor's stripes), in a picture whose ink edges are soft (median steepness under 0.60, or since r9 median
  width 2.3 px or more: such a plan as the app's PDF renderer draws it, its pixels repeated) and of 0.4 MP or more;
  there (r9) its light lines are traced as lines, not grey areas, and a row of hangers is not taken for a word; in
  such a picture of 1.5 MP or more (r10) its line work is read smoothed and kept whole across its width, so a long
  slanting or curved line is one line or band, not a ladder of short pieces. A letter touching a line as dark as
  itself can still blob or lose a stroke. Since r11 every trace is also tidied as a drawing (`tidy` in
  `faithful_trace.py`): a letter's or figure's outline is read from the picture enlarged smoothly, at half its darkest
  (not the steps of its pixels at 2x); an I or l in a word is outlined like its neighbours; a band's tint lies under
  its lettering; a thin line has one weight along its length, from all its ink across it; a line traced in pieces or
  twice is drawn once; a door swing runs into its jamb and onto its leaf; a hatch stroke ends within the wall's line;
  and a slash tick split by the lines it crosses is one slash. Lines meeting at a corner take one weight and meet
  exactly, so the corner is square. Whole circles (a sink's waste, a hob's burners) are fitted as circles, each ring of
  a close double ring as its own circle (`fit_rings`). Since r12 a fixture or piece of furniture drawn in thin lines
  (a sink's basin and drainer, a hob, a WC) is redrawn clean rather than copied with its blur (J, 29 Oct): read along
  each line's centre and drawn as the fewest straight lines and true arcs within a third of a pixel of it, corners exact
  and curves tangent, a gentle curve as one arc and a ring as one circle; two hairlines blurred into one band (a basin's
  double rim) as two; a faint break or a ring's faint part carried through; lines that meet at a junction joined end
  to end by a smooth bridge, so each shape is one path with no notches (`clean_lines.py`). Only fixture-size pieces
  are redrawn (at least 2.5 letters tall both ways, at most 8 % of the picture, with the hairline pieces inside one: a
  drainer's slots), never lettering (marks in a row with a letter's stroke weight) and never a figure in dashes. Line widths and greys are brought to the plan's few pens.
  Retyping confidently read lettering in clean type (`retype.py`, Liberation Sans outlines in `faithful_glyphs.json`,
  SIL Open Font License, `OFL.txt`, rebuilt by `make_glyphs.py`, which needs fontTools) is built but off
  (`FT_RETYPE=1` turns it on): in a blind check it set two fonts on one plan and misread a few figures.
- Since 31 Oct a plan that leans a little is drawn straight (`FT_STRAIGHTEN`, on; `FT_STRAIGHTEN=0` draws it as
  traced). A scan or a re-saved web plan often has its plumb lines all leaning one way by a few tenths of a degree,
  and sometimes its level lines too (a shear or a slight turn; J on s038). The lean is read from the drawing's own
  line work (points along its near-plumb, or near-level, edges sheared until their columns, or rows, are sharpest,
  within 2 degrees), which also finds a wall the trace squared into plumb pieces a pixel apart. A direction counts
  when it reads clearly sharper leaning (5 % or more, by 0.1 degree or more, adding up to 1.5 px or more across the
  line work) and the picture's own long straight lines (80 px or longer, read with OpenCV's line segment detector)
  lean the same way, between half and twice as far: a few short lines can line up by chance under a shear. It is put
  right by one affine map of the whole drawing; then each run of near-plumb (or near-level) straight edges is set to
  one x (or y), at the place within its pixel where most of it was traced, so it draws at its traced weight and grey,
  with every corner, junction and door swing's end carried along. Everything else moves by whole pixels; a letter (its
  holes with it) and the letters of a word move as one. The drawing then sits up to a few pixels off the picture
  towards its edges (3.6 px at most on the test pages), which shows in the overlay views. On the 77 open test pages it
  changes 17 (most of them small web plans) and leaves the rest exactly as traced. Stage 1's rooms and walls are
  unchanged (on s038 they were already square: none of its 30 wall edges off level or plumb). In a blind check of the
  17 (graders shown the picture and both drawings, unlabelled, told to set the squaring and its shift aside) 32 of 34
  judgements were the same, one each way; they saw the squaring in 23. Two earlier versions lost such checks, with the
  squaring counted against them, on faults since fixed: lines set where they draw crisp turned grey lines black,
  letters' outlines and holes moved apart, and straight plans whose few lines lined up by chance were tilted.
- Up to `FLOOR_PLAN_FAITHFUL_TRACE_MAX_PIXELS` pixels (default 4,000,000) the trace works at twice the picture's size:
  about 350–400 MB of memory per million pixels of the picture (700–760 MB for a 1,400 px brochure page) and 30–50 s
  per page on one core. A larger page, up to three times that limit, is traced at its own size: about 110 MB per
  million pixels, so no more memory than the largest page at twice its size (a 10 MP brochure page: 29 s, 0.93 GB);
  lines a pixel apart may merge. A larger page still is left.
- When stage 1 or the exporter fails or runs out of time, the faithful trace still runs on the page on its own
  (`drawPage`); it does not need stage 1.
- The app shows the faithful trace on every page it drew, a PDF page with vector headings and a picture plan included,
  and nothing older: a page it leaves, a failure or a timeout (`FLOOR_PLAN_FAITHFUL_TRACE_TIMEOUT_MS`, default 240000)
  gets no traced drawing (its picture shows as it is), and the page's notes say why (`Faithful trace not used: …`,
  `Faithful trace unavailable: …`, `No traced drawing: …`).
- It needs numpy, OpenCV 4 and scikit-image from `requirements.txt`; not tesseract.

No upload gives nothing (beta step 2.1, 30 Oct 2026; both switches off unless set in the worker's environment):
- `FV_INVERT_DARK=1`: a plan drawn in light lines on a dark ground (120 Grange's brochure pages) is read by stage 1 and
  traced by the faithful trace turned over, as dark ink on light paper, instead of being read as nothing and left. A
  page counts as light on dark when its most common grey is darker than mid-grey, at least twice as much of its ink is
  lighter than that as darker (a dim photo of an ordinary plan is left as it is), and it is dark round its edges. On
  the 87 open test pages it picks exactly the two 120 Grange pages. Stage 1 marks such a page `inverted_dark_ground`.
- `FLOOR_PLAN_VECTORIZER_PAGE_BUDGET=1`: the faithful trace runs inside the page's own time limit
  (`FLOOR_PLAN_VECTORIZER_TIMEOUT_MS`) instead of after it, cut at that limit. A page that reaches the trace with less
  than `FLOOR_PLAN_FAITHFUL_TRACE_MIN_MS` left (default 30000) keeps stage 1's reading without the trace, noted
  (`Faithful trace not used: the page's time limit was nearly spent`). A page stage 1 could not read is still traced on
  its own, as before.

The name reader (beta step 2.2; `FLOOR_PLAN_NAME_READER=1`, off unless set, `FLOOR_PLAN_NAME_READER_TIMEOUT_MS`
default 60000): `name_reader.py` reads the page's room names a second time with RapidOCR (PP-OCR on ONNX Runtime,
Apache-2.0) at its own size and twice it, between stage 1 and the exporter, and merges them into stage 1's model: a
room name stage 1 left unread is added, and a misreading that is no room name (BEL200M, ITCH:) is replaced, keeping
stage 1's box (it joins a name's lines). Notes, captions, flat types, service labels, bracketed labels and garbled
words of two to four letters are left out. It reads within `FLOOR_PLAN_NAME_READER_MAX_PIXELS` (default 8000000, about
1.4 GB at most): twice the page's size only while that fits, and a larger page shrunk to it. It fails soft (`Name
reader unavailable: …`). Its model files ship inside its package, installed by `worker.Dockerfile` with `--no-deps`
(its own `opencv-python` would clash with `opencv-python-headless`); the doctor checks it reads a word from the image
alone. For a local venv: `pip install -r requirements.txt && pip install --no-deps rapidocr_onnxruntime==1.3.24`.

Everything runs on the worker; page bytes are written to a private temporary folder that is removed afterwards.
Development history, scoring tools, truth files and test plans live in the main checkout's copy of this folder
(`APP-EXPORT.md`, `TUNING.md`, `tools/`); this copy holds only what the worker runs.
