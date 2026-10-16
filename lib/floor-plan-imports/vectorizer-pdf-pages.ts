import type { RegisteredPageEvidence } from "./deterministic-evidence";
import { pageLineworkKind } from "./mixed-pdf-evidence";
import type { PageScaleSolution } from "./pdf-raster-evidence";
import { diagnoseSourceScale } from "./source-scale-cross-check";

/** The adapter's topology registration, passed in so this module does not import the adapter. */
export type PageRoomRegistration = (
  page: RegisteredPageEvidence,
  scale: PageScaleSolution | null
) => { rooms: unknown[] };

/**
 * Whether a page's own linework closes at least one room, judged on a copy of the page
 * with the scale the page's printed dimensions give (diagnosis notes stay off the page).
 */
export function ownLineworkClosesRooms(page: RegisteredPageEvidence, registerRooms: PageRoomRegistration) {
  const probe = structuredClone(page);
  const diagnosis = diagnoseSourceScale(probe);
  const scale = diagnosis.status === "accepted" && diagnosis.candidate
    ? { pageNumber: probe.pageNumber, ...diagnosis.candidate }
    : null;
  return registerRooms(probe, scale).rooms.length > 0;
}

/**
 * The pages the local vectorizer reads: every page read as a raster (an image upload, or a
 * PDF page without usable vector linework), and a vector PDF page whose own linework closes
 * no room. A drawn HDB floor-plan PDF often has clean vector paths that the deterministic
 * topology cannot pair into walls; its rendered page is then read like an image. Complete
 * deterministic topology still ranks first, so the vectorizer only adds rooms where the
 * page's own linework had none.
 */
export function vectorizerCandidatePages(
  pages: RegisteredPageEvidence[],
  rasterPages: RegisteredPageEvidence[],
  closesRooms: (page: RegisteredPageEvidence) => boolean
) {
  const candidates = [...rasterPages];
  for (const page of pages) {
    if (candidates.includes(page) || pageLineworkKind(page) !== "pdf_vector") continue;
    if (!closesRooms(page)) candidates.push(page);
  }
  return candidates;
}

/** Vector PDF text is exact; there the vectorizer's readings supplement it rather than lead. */
export function vectorizerReadingsLead(page: RegisteredPageEvidence) {
  return pageLineworkKind(page) !== "pdf_vector";
}
