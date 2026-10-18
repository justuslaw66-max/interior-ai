import type { RegisteredPageEvidence } from "./deterministic-evidence";
import {
  findScaleBarGeometry,
  readScaleBar,
  scaleBarLabelStrips,
  scaleBarWordsFromText,
  type ScaleBarEvidence,
  type ScaleBarWord,
} from "./scale-bar-evidence";

/** Reads the numbers of ruled bars that have no text: renders the strip beside each bar and runs local OCR on it. */
export type ScaleBarStripReader = {
  read(page: RegisteredPageEvidence, strip: { left: number; top: number; right: number; bottom: number }): Promise<ScaleBarWord[]>;
  close(): Promise<void>;
};

/**
 * What the scale-bar step found on a page, kept in the source manifest so a page without a scale says why:
 * - `read_from_text` / `read_by_ocr`: the bar set the scale;
 * - `no_bar`: no numbered bar in the text and no ruled bar in the geometry;
 * - `ocr_unavailable`: a ruled bar, but no local OCR on this server;
 * - `ocr_skipped`: a ruled bar, but OCR was spent on earlier pages or failed there;
 * - `ocr_failed`: OCR raised an error (its message is kept);
 * - `bar_unread`: OCR read the strips, but no reading fitted the ticks.
 */
export type ScaleBarDiagnostics = {
  status: "read_from_text" | "read_by_ocr" | "no_bar" | "ocr_unavailable" | "ocr_skipped" | "ocr_failed" | "bar_unread";
  barCount: number;
  stripsRead: number;
  error: string | null;
};

type StripOutcome = { reading: ScaleBarEvidence | null; stripsRead: number; error: string | null };

async function readFromStrips(page: RegisteredPageEvidence, reader: ScaleBarStripReader): Promise<StripOutcome> {
  let stripsRead = 0;
  try {
    for (const bar of findScaleBarGeometry(page)) {
      for (const strip of scaleBarLabelStrips(page, bar)) {
        stripsRead += 1;
        const reading = readScaleBar(page, await reader.read(page, strip), "local_ocr");
        if (reading) return { reading, stripsRead, error: null };
      }
    }
    return { reading: null, stripsRead, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { reading: null, stripsRead, error: message.replace(/\s+/g, " ").slice(0, 200) };
  }
}

const UNREAD_PREFIX = "Scale bar not read:";

/** The reviewer's note when local OCR ran on a ruled bar but no reading came of it; the error stays in the manifest. */
function unreadBarNote(page: RegisteredPageEvidence, diagnostics: ScaleBarDiagnostics) {
  const why = diagnostics.status === "ocr_failed" ? "reading its numbers failed" : "its numbers did not line up with its ticks";
  const note = `${UNREAD_PREFIX} what looks like a scale bar was found, but ${why}. ` +
    "Confirm one known distance, such as two of its numbered ticks.";
  if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
}

/** The page's unread-bar note, for the scale review's message. */
export function scaleBarUnreadMessage(page: RegisteredPageEvidence | undefined): string | null {
  return page?.semantics.notes.findLast((note) => note.startsWith(UNREAD_PREFIX)) ?? null;
}

async function scaleBarOnPage(page: RegisteredPageEvidence, reader: ScaleBarStripReader | null,
  ocrAllowed: boolean): Promise<ScaleBarDiagnostics> {
  const fromText = readScaleBar(page, scaleBarWordsFromText(page.text), "pdf_text");
  const barCount = findScaleBarGeometry(page).length;
  const base = { barCount, stripsRead: 0, error: null };
  if (fromText) {
    page.scaleBar = fromText;
    return { ...base, status: "read_from_text" };
  }
  if (!barCount) return { ...base, status: "no_bar" };
  if (!reader) return { ...base, status: "ocr_unavailable" };
  if (!ocrAllowed) return { ...base, status: "ocr_skipped" };
  const outcome = await readFromStrips(page, reader);
  if (outcome.reading) page.scaleBar = outcome.reading;
  const status = outcome.reading ? "read_by_ocr" : outcome.error ? "ocr_failed" : "bar_unread";
  return { barCount, stripsRead: outcome.stripsRead, error: outcome.error, status };
}

/**
 * Records a scale bar on each page that has one, and what the step found on every page. Pages come in ranked order;
 * OCR is spent on at most `ocrPageLimit` pages whose bars carry no text, and on none after it fails. When OCR ran on a
 * page's bar but no reading came of it, the page gets a note for the reviewer; its evidence is otherwise left as it was.
 */
export async function applyScaleBarEvidence(pages: RegisteredPageEvidence[], reader: ScaleBarStripReader | null,
  ocrPageLimit = 2): Promise<Map<number, ScaleBarDiagnostics>> {
  const diagnostics = new Map<number, ScaleBarDiagnostics>();
  let ocrPages = 0;
  try {
    for (const page of pages) {
      const result = await scaleBarOnPage(page, reader, ocrPages < ocrPageLimit);
      // A failure (most often the OCR deadline) would recur on the next page, so it spends the whole budget.
      if (result.status === "ocr_failed") ocrPages = ocrPageLimit;
      else if (result.status === "read_by_ocr" || result.status === "bar_unread") ocrPages += 1;
      if (result.status === "ocr_failed" || result.status === "bar_unread") unreadBarNote(page, result);
      diagnostics.set(page.pageNumber, result);
    }
  } finally {
    await reader?.close().catch(() => undefined);
  }
  return diagnostics;
}
