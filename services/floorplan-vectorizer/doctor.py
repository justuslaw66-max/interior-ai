#!/usr/bin/env python3
"""
doctor.py  --  is this machine able to run the floor-plan vectorizer?

Run it with the interpreter the worker will use (the one FLOOR_PLAN_VECTORIZER_PYTHON names):

    services/floorplan-vectorizer/.venv/bin/python3 services/floorplan-vectorizer/doctor.py          # the runtime
    services/floorplan-vectorizer/.venv/bin/python3 services/floorplan-vectorizer/doctor.py --run    # + both programs on a drawn plan
    services/floorplan-vectorizer/.venv/bin/python3 services/floorplan-vectorizer/doctor.py --run=plan.png

One line per check, "ok" / "WARN" / "FAIL"; exit code 0 when nothing failed. FAIL means an import with
FLOOR_PLAN_VECTORIZER_ENABLED=1 would fall back to the other evidence sources on this machine (the provider fails
soft; the page keeps the note "Local vectorizer unavailable: ..."). WARN is something to look at, not a stop.
"""
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = []


def check(name, ok, detail="", warn=False):
    status = "ok" if ok else ("WARN" if warn else "FAIL")
    REPORT.append(status)
    print("%-4s %-34s %s" % (status, name, detail))
    return ok


def check_python():
    v = sys.version_info
    check("python", v >= (3, 9), "%d.%d.%d at %s" % (v.major, v.minor, v.micro, sys.executable))
    named = os.environ.get("FLOOR_PLAN_VECTORIZER_PYTHON")
    if named:
        same = os.path.realpath(named) == os.path.realpath(sys.executable)
        check("FLOOR_PLAN_VECTORIZER_PYTHON", same, named + ("" if same else "  <- not this interpreter; run the doctor with it"), warn=True)
    else:
        check("FLOOR_PLAN_VECTORIZER_PYTHON", False, "unset: the worker would run plain `python3`, which is %s" % (
            "this interpreter" if os.path.realpath(sys.executable) == os.path.realpath(which("python3") or "") else "NOT this interpreter"), warn=True)


def which(program):
    for folder in os.environ.get("PATH", "").split(os.pathsep):
        candidate = os.path.join(folder, program)
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def check_modules():
    try:
        import numpy
        check("numpy", True, numpy.__version__)
    except ImportError as cause:
        return check("numpy", False, "%s -- pip install -r requirements.txt" % cause)
    try:
        import cv2
        major = int(cv2.__version__.split(".")[0])
        check("opencv", major == 4, cv2.__version__ + ("" if major == 4 else "  <- must be 4.x (OpenCV 5 returns HoughLinesP / contours in another shape); pin with requirements.txt"))
    except ImportError as cause:
        check("opencv", False, "%s -- pip install -r requirements.txt" % cause)
    try:
        import skimage
        from skimage.morphology import skeletonize  # noqa: F401  (the only scikit-image function the tracer uses)
        check("scikit-image", True, skimage.__version__)
    except ImportError as cause:
        check("scikit-image", False, "%s -- pip install -r requirements.txt" % cause)
    try:
        import pytesseract
        check("pytesseract", True, pytesseract.__version__ if hasattr(pytesseract, "__version__") else "present")
        return True
    except ImportError as cause:
        return check("pytesseract", False, "%s -- pip install -r requirements.txt" % cause)


def check_tesseract():
    import pytesseract
    program = pytesseract.pytesseract.tesseract_cmd
    found = which(program) if os.sep not in program else (program if os.path.isfile(program) else None)
    if not check("tesseract program", bool(found), found or "`%s` not on PATH -- apt-get install tesseract-ocr / brew install tesseract" % program):
        return False
    try:
        version = pytesseract.get_tesseract_version()
        check("tesseract version", int(str(version).split(".")[0]) >= 4, str(version))
    except Exception as cause:  # noqa: BLE001
        return check("tesseract version", False, str(cause))
    try:
        languages = pytesseract.get_languages(config="")
        check("tesseract eng data", "eng" in languages, ", ".join(languages) or "no languages -- install tesseract-ocr-eng / set TESSDATA_PREFIX")
    except Exception as cause:  # noqa: BLE001
        check("tesseract eng data", False, str(cause))
    return ocr_smoke()


def ocr_smoke():
    """tesseract reads a number the way the tracer asks for printed dimensions (psm 7, digits only)."""
    import cv2
    import numpy as np
    import pytesseract
    image = np.full((140, 420), 255, np.uint8)
    cv2.putText(image, "2410", (40, 100), cv2.FONT_HERSHEY_TRIPLEX, 2.0, 0, 3, cv2.LINE_AA)
    try:
        read = pytesseract.image_to_string(image, config="--psm 7 -c tessedit_char_whitelist=0123456789").strip()
    except Exception as cause:  # noqa: BLE001
        return check("tesseract reads digits", False, str(cause))
    if read == "2410":
        return check("tesseract reads digits", True, "read 2410 for a drawn 2410")
    # A different read is a font / version nuance, not a broken install; an empty read is.
    return check("tesseract reads digits", bool(read), "read %r for a drawn 2410" % read, warn=True)


def programs_directory():
    configured = os.environ.get("FLOOR_PLAN_VECTORIZER_DIR")
    if configured:
        # The worker resolves a relative directory against its working directory (the repository root).
        return os.path.abspath(configured), "FLOOR_PLAN_VECTORIZER_DIR=%s" % configured
    return HERE, "default (this folder)"


def check_programs(directory, note):
    ok = True
    for name in ("floorplan_vectorize.py", "app_evidence.py"):
        path = os.path.join(directory, name)
        present = os.path.isfile(path)
        if present:
            try:
                compile(open(path, "rb").read(), path, "exec")
            except SyntaxError as cause:
                present = False
                note = "syntax error: %s" % cause
        ok = check(name, present, ("%s (%s)" % (path, note)) if present else "missing at %s (%s)" % (path, note)) and ok
    return ok


def check_settings():
    enabled = os.environ.get("FLOOR_PLAN_VECTORIZER_ENABLED")
    check("FLOOR_PLAN_VECTORIZER_ENABLED", enabled == "1", "%r -- the vectorizer runs only when this is exactly \"1\" on the process that runs imports" % enabled, warn=True)
    timeout = os.environ.get("FLOOR_PLAN_VECTORIZER_TIMEOUT_MS")
    check("FLOOR_PLAN_VECTORIZER_TIMEOUT_MS", True, (timeout or "unset -> 420000 (7 min per page; clamped to 10 s - 15 min)"))
    try:
        folder = tempfile.mkdtemp(prefix="vectorizer-doctor-")
        os.rmdir(folder)
        check("temporary folder", True, tempfile.gettempdir())
    except OSError as cause:
        check("temporary folder", False, "%s: %s" % (tempfile.gettempdir(), cause))


def draw_plan(path):
    """A small two-room plan: filled walls, a partition with a door, an entrance, a window, two labels and a
    5000 + 5000 / 6000 mm dimension chain (10 mm per pixel)."""
    import cv2
    import numpy as np
    image = np.full((1000, 1400), 255, np.uint8)
    T, x0, y0, x1, y1, xm = 12, 200, 150, 1200, 750, 700
    cv2.rectangle(image, (x0 - T // 2, y0 - T // 2), (x1 + T // 2, y1 + T // 2), 0, -1)
    cv2.rectangle(image, (x0 + T // 2, y0 + T // 2), (x1 - T // 2, y1 - T // 2), 255, -1)
    cv2.rectangle(image, (xm - T // 2, y0), (xm + T // 2, 600), 0, -1)
    cv2.rectangle(image, (xm - T // 2, 690), (xm + T // 2, y1), 0, -1)
    cv2.line(image, (xm + T // 2, 690), (xm + T // 2 + 90, 690), 0, 2)
    cv2.ellipse(image, (xm + T // 2, 690), (90, 90), 0, 270, 360, 0, 2)
    cv2.rectangle(image, (400, y1 - T // 2 - 1), (490, y1 + T // 2 + 1), 255, -1)
    cv2.line(image, (400, y1 - T // 2), (400, y1 - T // 2 - 90), 0, 2)
    cv2.ellipse(image, (400, y1 - T // 2), (90, 90), 0, 270, 360, 0, 2)
    cv2.rectangle(image, (850, y0 - T // 2 - 1), (1050, y0 + T // 2 + 1), 255, -1)
    cv2.rectangle(image, (850, y0 - T // 2), (1050, y0 + T // 2), 0, 2)
    cv2.line(image, (850, y0), (1050, y0), 0, 2)
    cv2.putText(image, "LIVING", (380, 450), cv2.FONT_HERSHEY_SIMPLEX, 1.2, 0, 2, cv2.LINE_AA)
    cv2.putText(image, "BEDROOM", (830, 450), cv2.FONT_HERSHEY_SIMPLEX, 1.2, 0, 2, cv2.LINE_AA)
    yd = 870
    cv2.line(image, (x0, yd), (x1, yd), 0, 1)
    for x in (x0, xm, x1):
        cv2.line(image, (x, yd - 10), (x, yd + 10), 0, 1)
        cv2.line(image, (x, y1 + T // 2 + 6), (x, yd + 4), 0, 1)
    cv2.putText(image, "5000", (410, yd - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2, cv2.LINE_AA)
    cv2.putText(image, "5000", (910, yd - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2, cv2.LINE_AA)
    xd = 110
    cv2.line(image, (xd, y0), (xd, y1), 0, 1)
    for y in (y0, y1):
        cv2.line(image, (xd - 10, y), (xd + 10, y), 0, 1)
        cv2.line(image, (xd - 4, y), (x0 - T // 2 - 6, y), 0, 1)
    label = np.full((60, 130), 255, np.uint8)
    cv2.putText(label, "6000", (5, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2, cv2.LINE_AA)
    image[385:515, xd - 62:xd - 2] = cv2.rotate(label, cv2.ROTATE_90_COUNTERCLOCKWISE)
    cv2.imwrite(path, image)


def run_programs(directory, image):
    """Both programs as the worker runs them (subprocesses of this interpreter, absolute paths, a private folder)."""
    import json
    folder = tempfile.mkdtemp(prefix="vectorizer-doctor-")
    try:
        drawn = image is None
        if drawn:
            image = os.path.join(folder, "plan.png")
            draw_plan(image)
        base = os.path.join(folder, "page")
        started = time.time()
        for args in ([os.path.join(directory, "floorplan_vectorize.py"), image, base, "--px-size"],
                     [os.path.join(directory, "app_evidence.py"), base + ".json", base + ".evidence.json"]):
            result = subprocess.run([sys.executable] + args, capture_output=True, text=True)
            if result.returncode != 0:
                last = (result.stderr.strip().split("\n") or [""])[-1]
                return check("run " + os.path.basename(args[0]), False, "exit %d: %s" % (result.returncode, last[:200]))
            check("run " + os.path.basename(args[0]), True, "%.0f s" % (time.time() - started))
        evidence = json.load(open(base + ".evidence.json"))
        scale = evidence["scale"]
        rooms = evidence["rooms"]
        labels = sorted(r.get("label") or "?" for r in rooms)
        detail = "%d room(s) %s, %d opening(s), scale %s %s mm/px, %.0f s" % (
            len(rooms), labels, len(evidence["semantics"]["openingSymbols"]), scale["basis"], scale["millimetresPerPixel"], time.time() - started)
        if not drawn:
            return check("evidence for " + os.path.basename(image), evidence["kind"] == "floor_plan_vectorizer_evidence", detail)
        mm = scale["millimetresPerPixel"] or 0
        expected = scale["basis"] == "explicit_dimension" and abs(mm - 10) < 0.2 and len(rooms) >= 1 and "BEDROOM" in labels
        return check("evidence for the drawn plan", expected, detail + ("" if expected else "  <- expected explicit_dimension near 10 mm/px, a room named BEDROOM"))
    finally:
        for root, folders, files in os.walk(folder, topdown=False):
            for name in files:
                os.unlink(os.path.join(root, name))
            for name in folders:
                os.rmdir(os.path.join(root, name))
        os.rmdir(folder)


def main():
    run = None
    for argument in sys.argv[1:]:
        if argument == "--run":
            run = True
        elif argument.startswith("--run="):
            run = argument[len("--run="):]
    directory, note = programs_directory()
    check_python()
    modules = check_modules()
    tesseract = modules and check_tesseract()
    programs = check_programs(directory, note)
    check_settings()
    if run is not None:
        if modules and tesseract and programs:
            run_programs(directory, None if run is True else run)
        else:
            check("run", False, "skipped: fix the failures above first")
    failed = REPORT.count("FAIL")
    print("\nRESULT: %s (%d checks, %d warning(s))" % ("READY" if failed == 0 else "%d FAILED" % failed, len(REPORT), REPORT.count("WARN")))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
