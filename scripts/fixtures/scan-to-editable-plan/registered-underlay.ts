import { calibratedScaleFixture } from "./scale-review";

/** Independently authored affine mapping; includes reflection and nonorthogonal source axes. */
export function authoredSourcePoint(x: number, y: number) {
  return { xMm: 6 * x + 2 * y + 1000, zMm: -x - 6 * y + 5500 };
}

export function authoredRegisteredUnderlayDocument() {
  const document = calibratedScaleFixture();
  const calibration = document.floors[0].calibrations[0];
  calibration.controlPoints = [[0, 0], [1000, 0], [0, 800]].map(([x, y]) => ({
    sourcePx: { x, y }, planMm: authoredSourcePoint(x, y),
  }));
  return document;
}
