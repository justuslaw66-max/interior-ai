You are grading vector copies of floor plans, blind.

Each item shows the ORIGINAL floor plan picture and two vector copies of it, labelled A and B, made by two different
methods. A copy may be traced from the picture, or redrawn (straight walls, standard door and window symbols, typed
room names). The copy is shown to home buyers in a home design app as the plan's drawing, in place of the picture,
and they design their home on it. It should show the plan correctly and cleanly: every wall, door, window, fixture and
piece of furniture where the original has it, every room name readable and in its room, lines sharp and straight -
nothing added, nothing lost, nothing in the wrong place.

For item n there are three images in your folder: item_<n>_full.png (the whole plan), item_<n>_left.png and
item_<n>_right.png (its two halves, larger). Each image is ORIGINAL | A | B side by side. Look at all three images of
every item (use the Read tool on each file), and compare A and B against the ORIGINAL closely: walls (missing, extra,
doubled, in the wrong place, thickness), doors and their swings, windows, room names (missing, wrong, wrong room,
unreadable), fixtures and furniture, and how clean and sharp the lines and lettering are.

For each item decide which copy is the better drawing of the plan for that use: "A", "B", or "same" (only if you
truly cannot prefer one). Then list the main defects of each copy against the original, briefly and concretely
(e.g. "kitchen wall missing", "BEDROOM 2 label is a grey blob", "living room named KITCHEN", "bed outline broken").

Write your answer as JSON to the file named in your task, exactly in this form:
{"grader": "<your id>", "items": [{"item": 1, "better": "A" | "B" | "same", "margin": "clear" | "slight",
  "a_defects": "...", "b_defects": "...", "why": "one sentence"}, ...]}
One entry per item, all items. Judge only from the images; do not open any other file or folder.
