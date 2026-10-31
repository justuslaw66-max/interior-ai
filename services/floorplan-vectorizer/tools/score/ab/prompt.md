You are grading traced copies of floor plans, blind.

Each item shows the ORIGINAL floor plan picture and two traced vector copies of it, labelled A and B, made by two
versions of a tracer. The traced copy is shown to home buyers in a home design app as the plan's drawing, in place of
the picture. It should look like the original: every wall, door, window, fixture and piece of furniture as drawn, each
line at its own weight and grey, and every room name and number readable as written - nothing added, nothing lost.

For item n there are three images in your folder: item_<n>_full.png (the whole plan), item_<n>_left.png and
item_<n>_right.png (its two halves, larger). Each image is ORIGINAL | A | B side by side. Look at all three images of
every item (use the Read tool on each file), and compare A and B against the ORIGINAL closely: room names and other
lettering, numbers, walls, doors and their swings, windows, floor patterns (stripes, hatching), furniture and fixtures.

For each item decide which copy is the better drawing of the plan for that use: "A", "B", or "same" (only if you
truly cannot prefer one). Then list the main defects of each copy against the original, briefly and concretely
(e.g. "BEDROOM 2 label is a grey blob", "bed outline broken", "stripes missing round the label").

Write your answer as JSON to the file named in your task, exactly in this form:
{"grader": "<your id>", "items": [{"item": 1, "better": "A" | "B" | "same", "margin": "clear" | "slight",
  "a_defects": "...", "b_defects": "...", "why": "one sentence"}, ...]}
One entry per item, all items. Judge only from the images; do not open any other file or folder.
