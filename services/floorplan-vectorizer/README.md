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

Everything runs on the worker; page bytes are written to a private temporary folder that is removed afterwards.
Development history, scoring tools, truth files and test plans live in the main checkout's copy of this folder
(`APP-EXPORT.md`, `TUNING.md`, `tools/`); this copy holds only what the worker runs.
