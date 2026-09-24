import { extractSourceArtwork } from "./source-artwork-trace";
import { extractRasterLinework, normalizeRasterForLinework,type RasterLineworkDiagnostics } from "./raster-linework";
import type { FloorPlanAdapterContext,StoredFloorPlanSource } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
import type { RegisteredPageEvidence,PageSemanticEvidence } from "./deterministic-evidence";
const emptySemantics=():PageSemanticEvidence=>({planRegion:null,unitSystem:"unknown",roomLabels:[],roomBoundaries:[],dimensionLabels:[],openingSymbols:[],fixtureSymbols:[],entrance:null,notes:[]});
export async function attachRasterSourceArtwork(pages:RegisteredPageEvidence[], rendered:FloorPlanRenderedPage[],context:FloorPlanAdapterContext) {
  for(const page of pages) {
    const preview=rendered.find(p=>p.pageNumber===page.pageNumber);
    try {
      const asset=preview&&context.store.readDerivative?await context.store.readDerivative(preview.assetKey):null;
      if(!asset)continue;
      page.sourceArtwork=await extractSourceArtwork(asset.bytes,{widthPx:page.widthPx,heightPx:page.heightPx,signal:context.signal,textRegions:page.text});
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
