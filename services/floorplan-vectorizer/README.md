# Floor-plan vectorizer (worker-side Python)

Run by `PythonFloorPlanVectorizerProvider` (`lib/floor-plan-imports/vectorizer-evidence.ts`) on one rendered plan page:

    python3 floorplan_vectorize.py page.png out/page --px-size     # image → model JSON (+ SVG, cleaned work image)
    python3 app_evidence.py out/page.json out/page.evidence.json   # model → evidence in the import pipeline's types

Off unless `FLOOR_PLAN_VECTORIZER_ENABLED=1`. Other settings: `FLOOR_PLAN_VECTORIZER_DIR` (default
`<cwd>/services/floorplan-vectorizer`), `FLOOR_PLAN_VECTORIZER_PYTHON` (default `python3`),
`FLOOR_PLAN_VECTORIZER_TIMEOUT_MS` (default 420000, 10 s – 15 min), `FLOOR_PLAN_VECTORIZER_MAX_PAGES` (default 1).

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
- the `tesseract` program (4.x or 5.x) with the English data on the worker's `PATH` — Debian/Ubuntu
  `apt-get install -y tesseract-ocr tesseract-ocr-eng`, macOS `brew install tesseract`;
- the settings on that process: `FLOOR_PLAN_VECTORIZER_ENABLED=1`, `FLOOR_PLAN_VECTORIZER_PYTHON=<absolute path to
  .venv/bin/python3>`, and only if the folder is elsewhere `FLOOR_PLAN_VECTORIZER_DIR`; `FLOOR_PLAN_VECTORIZER_TIMEOUT_MS`
  if 7 minutes per page is not right for the machine (the worker renews its lease while the programs run).

Hosts that run only the Next.js app (Vercel functions) cannot run this: no persistent process, no `tesseract`. Leave
the flag unset there; in `background` mode the app process never runs imports anyway.

There is no production worker yet (26 Sep 2026): the app on Vercel cannot host one. `worker.Dockerfile` in this folder
builds one — Node 24, the pinned venv, `tesseract` + English data, the worker as the command, and the doctor at build
time so a broken runtime does not build:

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
scikit-image / pytesseract, the `tesseract` program, its version and English data, a digit read the way the tracer
asks for one, both programs present, the temporary folder); `--run` also traces a small drawn plan through both
programs the way the worker runs them (about half a minute) and expects its rooms, a `BEDROOM` label and a scale of
10 mm per pixel back; `--run=/path/to/plan.png` traces a real plan instead and reports what came out. It ends with
`RESULT: READY` and exit code 0, or `RESULT: N FAILED`. Run it as the worker's user, with the worker's environment
(`env $(cat .env.production | xargs) …` or from the same service definition), since PATH and the settings are what it checks.

When the runtime is missing or a program fails, an import still completes from the other evidence sources: the
provider fails soft, the page's diagnostics carry `vectorizer.status: "failed"` with the last line the program wrote,
and its notes say `Local vectorizer unavailable: …` (a missing interpreter reads `spawn … ENOENT`; a missing
`tesseract` reads `the tesseract program is not on PATH …`). `npm run test:floor-plan-vectorizer-evidence` covers both.

Everything runs on the worker; page bytes are written to a private temporary folder that is removed afterwards.
Development history, scoring tools, truth files and test plans live in the main checkout's copy of this folder
(`APP-EXPORT.md`, `TUNING.md`, `tools/`); this copy holds only what the worker runs.
