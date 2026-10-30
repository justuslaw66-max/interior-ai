# Score harness: corrections per plan

How many edits a user makes in the import review step before an uploaded plan is right. This is J's beta bar as a
number: on fresh, unseen plans, the editable plan needs at most 3 corrections on 70 % of them.

The first version lived only in a cloud folder (`/root/t38/corr`, 17 Oct 2026) and was lost. This one was rebuilt on
30 Oct 2026 from its description in the project doc `claude/real-plan-check-2026-10-17.md`, and committed so that every
later round measures against the same tool.

- `document-from-evidence.ts`: runs exporter evidence through the app's own import stages (parse, register, solve the
  scale, build the topology, validate) and writes a summary of the `FloorPlanDocumentV2` a reviewer would see. The
  summary holds the scale, each room with its name, type and outline, and each opening with the rooms on either side of
  its wall. Where the app solves no scale, it stands in for the user's one scale correction (the exporter's figure, else
  10 mm/px).
- `corrections.py`: counts the corrections against the room truth files. The kinds are draw, split, join, rename and
  delete for rooms; add and delete for doors and windows; and set for the scale. The docstring has every rule. A
  "strict" column adds the near-misses: a door read as a doorway, extra doorways and windows, and names that differ
  only in a number.
- `docpic.py`: draws the app's document over the plan, with the corrections listed under it, for checking a count
  by eye.
- `score.sh <evidence dir> <out dir>`: runs both steps (from the checkout's root).
- `truth-reviewed/`: copies of the 15 dev and gate truth files J reviewed (`tools/truth-rooms/` on J's Mac).
  `truth-unreviewed/`: the 59 dev s-plan files Claude typed on 9 Oct. Both READMEs say more.
- `ab/`: the blind A/B harness for the clean drawing (its own README).

Sealed plans are never scored by name: `score.sh` passes the sealed list, and `corrections.py` prints them as
"(sealed)" with numbers only. Their truth files are not in this folder.

## Where it stands (30 Oct 2026, the deployed code)

These are the 74 development plans with truth, using stage 1 `0cfb5181` and exporter 0.34.0 (`9f5953d2`, round 41, the
code in worker image `9f7c425f989d`), from the Mac's corpus gate run `20261020-205930`. Development plans flatter the
vectorizer.

| | corrections | at most 1 | at most 3 | median | mean |
|---|---|---|---|---|---|
| rebuilt harness, round 41 | 675 | 11 | 22 (30 %) | 6 | 9.1 |
| old harness, round 40 (17 Oct) | 693 | | 20 (27 %) | | |

By kind (round 41): draw 94, split 18, join 9, rename 76, delete 17; doors to add 228, doors to delete 27; windows to
add 151, windows to delete 31; scale 24. Strict adds: doorway for a door 41, extra doorways 41, extra windows 134,
number-only renames 17.

The old harness last measured round 40 at 693; round 41 then took 34 off its 10 changed plans, so about 659 was
expected. The rebuilt rules land within about 2.5 % of that, kind by kind. They are not the same code, so compare
rounds only within one harness. Spot checks with `docpic.py` (s040, s010, d12) agree with the counts.

## Choices the description left open

- Spaces that share a printed label (two BEDROOMs): the rooms holding it go to those spaces in whichever order needs
  the fewest corrections.
- A truth door to a space still to be drawn counts as found when the app has a door from the other room to the
  outside, so it isn't counted twice.
- Doors to delete follow `roomscore.py`'s false door: a real door between two rooms given truth spaces (or one of them
  and the outside) that no truth door or doorway excuses. A leftover doorway counts in "strict" only.
- Windows are compared per group of spaces sharing app rooms (a merged room's windows serve all its spaces).

## Running it

On J's Mac, from the checkout's root:

    bash services/floorplan-vectorizer/tools/score/score.sh \
      services/floorplan-vectorizer/app-export-checks/runs/<run> /tmp/score-<run> -v

In a cloud sandbox without the repo's node_modules, set `TS_RUN` to another TypeScript runner (the cloud test kit's
`ts-run.cjs`, with zod on `NODE_PATH`).
