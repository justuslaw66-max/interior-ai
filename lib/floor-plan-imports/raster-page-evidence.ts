import { extractSourceArtwork } from "./source-artwork-trace";
import { extractRasterLinework, normalizeRasterForLinework,type RasterLineworkDiagnostics } from "./raster-linework";
import type { FloorPlanAdapterContext,StoredFloorPlanSource } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
import type { RegisteredPageEvidence,PageSemanticEvidence } from "./deterministic-evidence";
import { isFaithfulDrawing,pageCleanDrawing } from "./vectorizer-drawing";
const emptySemantics=():PageSemanticEvidence=>({planRegion:null,unitSystem:"unknown",roomLabels:[],roomBoundaries:[],dimensionLabels:[],openingSymbols:[],fixtureSymbols:[],entrance:null,notes:[]});
/**
 * A traced drawing for every page read from its picture, and for a PDF page the faithful trace drew (a brochure page
 * whose plan is a picture but whose headings are vector text). With the vectorizer's own drawing the trace is the clean
 * traced drawing (source-strokes-v3, or the faithful trace as it is); without one, the artwork trace. With the faithful
 * trace on (`faithfulOnly`), a page's traced drawing is the faithful trace or none: the older traces are not drawn
 * (J, 24 Oct), and the page's picture shows as it is.
 */
export async function attachSourceArtwork(pages:RegisteredPageEvidence[],rasterPages:RegisteredPageEvidence[],rendered:FloorPlanRenderedPage[],
  context:FloorPlanAdapterContext,faithfulOnly:boolean) {
  for(const page of pages) {
    const clean=pageCleanDrawing(page),faithful=isFaithfulDrawing(clean);
    if(!rasterPages.includes(page)&&!faithful)continue;
    if(faithfulOnly&&!faithful){page.semantics.notes.push("No traced drawing: the faithful trace did not draw this page, and the older traces are not drawn while it is on.");continue;}
    const preview=rendered.find(p=>p.pageNumber===page.pageNumber);
    try {
      const asset=preview&&context.store.readDerivative?await context.store.readDerivative(preview.assetKey):null;
      if(!asset)continue;
      page.sourceArtwork=await extractSourceArtwork(asset.bytes,{widthPx:page.widthPx,heightPx:page.heightPx,signal:context.signal,textRegions:page.text,clean});
    }catch(cause){page.semantics.notes.push(`Source artwork trace unavailable: ${cause instanceof Error?cause.message:"unknown error"}. Architectural evidence is retained.`);}
  }
}
export async function extractRasterEvidence(
  source: StoredFloorPlanSource,
  renderedPages: FloorPlanRenderedPage[],
  context: FloorPlanAdapterContext
): Promise<{
  pages: RegisteredPageEvidence[];
  diagnostics: Map<number, RasterLineworkDiagnostics>;
}> {
  const pages: RegisteredPageEvidence[] = [];
  const diagnostics = new Map<number, RasterLineworkDiagnostics>();
  for (const page of renderedPages) await extractPage(source,page,context,pages,diagnostics);
  return { pages, diagnostics };
}

async function extractPage(source:StoredFloorPlanSource,page:FloorPlanRenderedPage,context:FloorPlanAdapterContext,pages:RegisteredPageEvidence[],diagnostics:Map<number,RasterLineworkDiagnostics>) {
    try {
      const stored = context.store.readDerivative
        ? await context.store.readDerivative(page.assetKey)
        : null;
      let bytes = stored?.bytes;
      if (!bytes) {
        const normalized = await normalizeRasterForLinework(source.bytes);
        bytes = normalized.bytes;
      }
      const extracted = await extractRasterLinework(bytes, {
        pageNumber: page.pageNumber,
        expectedWidthPx: page.widthPx,
        expectedHeightPx: page.heightPx,
        normalization: page.normalization,
      });
      diagnostics.set(page.pageNumber, extracted.diagnostics);
      const semantics = emptySemantics();
      semantics.notes.push(
        extracted.vectorPaths.length
          ? `Deterministic raster linework found ${extracted.vectorSegments.length} axis-aligned segments and ${extracted.vectorPaths.length} conservative closed cycles. Room meaning, scale and openings still require independent evidence.`
          : "Raster linework did not contain a conservative closed rectilinear cycle. Keep the source underlay and use guided calibration/tracing."
      );
      pages.push({
        pageNumber: page.pageNumber,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        vectorSegments: extracted.vectorSegments,
        vectorPaths: extracted.vectorPaths,
        text: [],
        semantics,
      });
    } catch (cause) {
      const semantics = emptySemantics();
      semantics.notes.push(
        `Raster linework extraction unavailable: ${cause instanceof Error ? cause.message : "unknown error"}. Keep the source underlay and use guided tracing.`
      );
      pages.push({
        pageNumber: page.pageNumber,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        vectorSegments: [],
        vectorPaths: [],
        text: [],
        semantics,
      });
    }
}
