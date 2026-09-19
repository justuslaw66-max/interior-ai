import mountedTestInventory from "../../scripts/window-opening-mounted-tests.json";

export const WINDOW_OPENING_TRACE_MODE = "on";
const mountedTestIds = new Set(mountedTestInventory.map((entry) => entry.id));
const driverWarning = /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/;

type CaptureRuntimeEvent = {
  category: string;
  testId: string;
  pageId: string;
  message: string;
};

export function isWindowOpeningCaptureDriverWarning(
  event: CaptureRuntimeEvent,
  route: string | null,
  traceMode: string,
  acceptedEvents: readonly CaptureRuntimeEvent[]
): boolean {
  return traceMode === "on" && event.category === "consoleWarning" &&
    route === "/design" && mountedTestIds.has(event.testId) &&
    /^page-[1-9]\d*$/.test(event.pageId) && driverWarning.test(event.message) &&
    acceptedEvents.filter((prior) => prior.pageId === event.pageId &&
      driverWarning.test(prior.message)).length < 4;
}
