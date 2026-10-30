"""test_name_reader.py: the name reader's merge into stage 1's model (name_reader.py), without the reader itself.

    services/floorplan-vectorizer/.venv/bin/python3 -m unittest services/floorplan-vectorizer/test_name_reader.py
"""
import json, os, sys, tempfile, unittest

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import name_reader as nr
from app_evidence import ToSource


def page_with(words, size=(400, 300)):
    """a white page with each (text, x, y) written on it in black; returns the grey picture"""
    g = np.full((size[1], size[0]), 255, np.uint8)
    for text, x, y in words:
        cv2.putText(g, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2, cv2.LINE_AA)
    return g


def reading(text, x0, y0, x1, y1, score=0.95, scale=1):
    return {"text": text, "score": score, "scale": scale, "box": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]}


class Names(unittest.TestCase):
    def test_room_names_kept_notes_and_types_left(self):
        for s in ("BEDROOM", "MASTER BEDROOM", "BATH/WC", "KITCHEN", "BALCONY", "SERVICE YARD", "STORE", "A/C LEDGE", "LIVING/DINING",
                  "BEDROOM 2", "WC2", "BATH/WC1", "W.C.", "AIR-CON LEDGE", "HOUSE-HOLD SHELTER", "MAIN BEDROOM",
                  "MAINBEDROOM", "LIVINGROOM", "BEDR0OM2", "WCi", "RC LEDGE", "BEDROCM 3"):
            self.assertTrue(nr.is_room_name(s), s)
        for s in ("4 Room", "3-Bedroom", "5Room", "5-ROOM IMPROVED", "BUILT 1982-1985", "DUCT", "RISER", "REFUSE CHUTE",
                  "APPROX. 105 SQM", "FLOOR PLAN", "SCALE 1:100", "ALL PLANS ARE SUBJECT TO", "BED, BATH", "NOTE: AREA",
                  "100 DROP", "UP", "6325", "", "MAN BEDROOM", "LNNG ROOM", "DNNG ROOM", "(CORRIDOR)", "(POINT BLOCK)"):
            self.assertFalse(nr.is_room_name(s), s)


class Coordinates(unittest.TestCase):
    def test_from_source_undoes_to_source(self):
        base = {"size": [1600, 1200], "work_scale": 2.0}
        for extra in ({}, {"skew_deg": 1.5}, {"crop_offset": [40, 25], "page_size": [800, 600]}, {"pre_scale": 0.5},
                      {"page_homography": [[1.02, 0.01, -5.0], [0.0, 0.98, 3.0], [1e-5, 0.0, 1.0]]}):
            m = dict(base, **extra)
            to_src, to_work = ToSource(m), nr.FromSource(m)
            for p in ((10.0, 20.0), (700.0, 333.0), (1500.0, 1100.0)):
                back = to_src(*to_work(*p))
                self.assertAlmostEqual(back[0], p[0], places=6, msg=str(extra))
                self.assertAlmostEqual(back[1], p[1], places=6, msg=str(extra))


class Merge(unittest.TestCase):
    def setUp(self):
        self.gray = page_with([("BEDROOM", 40, 60), ("KITCHEN", 220, 60), ("BATH", 40, 200), ("STORE", 220, 200)])
        # stage 1 (work_scale 2): BEDROOM read right, KITCHEN misread as "ITCH:", BATH not read, STORE read right
        self.m = {"size": [800, 600], "work_scale": 2.0, "texts": [
            {"s": "BEDROOM", "box": [80, 90, 180, 34], "ink": [80, 90, 260, 124]},
            {"s": "ITCH:", "box": [450, 90, 150, 34], "ink": [450, 90, 600, 124]},
            {"s": "STORE", "box": [440, 370, 130, 34], "ink": [440, 370, 570, 404]},
        ]}

    def test_added_replaced_and_stood(self):
        readings = [reading("BEDROOM", 36, 40, 135, 66), reading("KITCHEN", 216, 40, 312, 66),
                    reading("BATH", 36, 180, 95, 206), reading("SHORE", 216, 180, 290, 206)]
        rep = nr.merge(self.m, readings, self.gray)
        self.assertEqual(rep["added"], ["BATH"], "a name stage 1 left unread is added")
        self.assertEqual(rep["replaced"], [["ITCH:", "KITCHEN"]], "a misread that is no room name is replaced")
        self.assertEqual(rep["stood"], 1, "stage 1's room name stands (BEDROOM)")
        self.assertEqual(rep["kept"], 3, "the reader's SHORE is no room name: left out, so stage 1's STORE stands")
        bath = next(t for t in self.m["texts"] if t["s"] == "BATH")
        x0, y0, x1, y1 = bath["ink"]
        self.assertTrue(70 <= x0 <= 90 and 360 <= y0 <= 390 and x1 <= 190 and y1 <= 415, "in working px, tight to the ink")
        self.assertEqual(bath["reader"], "rapidocr")
        self.assertEqual(sum(t["s"] == "STORE" for t in self.m["texts"]), 1)
        kitchen = next(t for t in self.m["texts"] if t["s"] == "KITCHEN")
        self.assertEqual((kitchen["box"], kitchen["ink"], kitchen["read_as"]), ([450, 90, 150, 34], [450, 90, 600, 124], "ITCH:"),
                         "a corrected reading keeps stage 1's box (it joins a name's lines)")

    def test_low_scores_notes_and_upright_left(self):
        readings = [reading("BATH", 36, 180, 95, 206, score=0.6), reading("4 ROOM", 36, 180, 95, 206),
                    reading("BATH", 60, 150, 75, 260)]
        rep = nr.merge(self.m, readings, self.gray)
        self.assertEqual((rep["kept"], rep["added"], rep["replaced"]), (0, [], []))

    def test_two_sizes_one_per_place_the_surer(self):
        readings = [reading("BATE", 36, 180, 95, 206, score=0.85), reading("BATH", 36.5, 180.5, 95.5, 206.5, score=0.97, scale=2)]
        rep = nr.merge(self.m, readings, self.gray)
        self.assertEqual(rep["added"], ["BATH"])

    def test_main_rewrites_model_and_plain_and_fails_soft(self):
        with tempfile.TemporaryDirectory() as d:
            page, model, plain, rd = (os.path.join(d, n) for n in ("page.png", "page.json", "page.plain.json", "r.json"))
            cv2.imwrite(page, self.gray)
            for p in (model, plain):
                with open(p, "w") as f:
                    json.dump(self.m, f)
            with open(rd, "w") as f:
                json.dump([reading("BATH", 36, 180, 95, 206)], f)
            nr.main([page, model, "--readings=" + rd])
            for p in (model, plain):
                with open(p) as f:
                    got = json.load(f)
                self.assertEqual(got["name_reader"]["added"], 1, p)
                self.assertTrue(any(t["s"] == "BATH" for t in got["texts"]))
            with open(model) as f:
                before = f.read()
            nr.main([os.path.join(d, "missing.png"), model, "--readings=" + rd])
            with open(model) as f:
                self.assertEqual(f.read(), before, "an error leaves the model as it was")


if __name__ == "__main__":
    unittest.main()
