import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const featureRoot = join(root, "features/cabinetry");
const studioPath = "features/cabinetry/components/CabinetryStudio.tsx";
const guidedViewPath =
  "features/cabinetry/components/CabinetryStudioGuidedView.tsx";
const detailedViewPath =
  "features/cabinetry/components/CabinetryStudioDetailedView.tsx";
const modeViewPaths = [guidedViewPath, detailedViewPath];
const contractPath =
  "features/cabinetry/components/CabinetryStudio.contract.ts";
const configPath =
  "features/cabinetry/components/CabinetryStudio.config.ts";
const studioTypesPath =
  "features/cabinetry/components/CabinetryStudio.types.ts";
const calculationsPath =
  "features/cabinetry/components/CabinetryStudio.calculations.ts";
const selectorsPath =
  "features/cabinetry/components/CabinetryStudio.selectors.ts";
const analyticsPath =
  "features/cabinetry/infrastructure/CabinetStudioAnalytics.ts";
const documentIOPath =
  "features/cabinetry/infrastructure/CabinetStudioDocumentIO.ts";
const historyPath =
  "features/cabinetry/state/CabinetStudioHistory.ts";
const definitionCommandsPath =
  "features/cabinetry/state/CabinetStudioDefinitionCommands.ts";
const moduleReorderDragPath =
  "features/cabinetry/hooks/useCabinetModuleReorderDrag.ts";
const customSpacesHookPath =
  "features/cabinetry/hooks/useCabinetStudioCustomSpaces.ts";
const measurementDraftsHookPath =
  "features/cabinetry/hooks/useCabinetStudioMeasurementDrafts.ts";
const preferencesHookPath =
  "features/cabinetry/hooks/useCabinetStudioPreferences.ts";
const propertyFocusHookPath =
  "features/cabinetry/hooks/useCabinetStudioPropertyFocus.ts";
const selectionControllerPath =
  "features/cabinetry/hooks/useCabinetStudioSelectionController.ts";
const validationExposureHookPath =
  "features/cabinetry/hooks/useCabinetStudioValidationExposure.ts";
const previewInteractionControllerPath =
  "features/cabinetry/components/CabinetStudioPreviewInteractionController.tsx";
const previewAdapterPath =
  "features/cabinetry/components/CabinetPreview3D.tsx";
const previewRendererPath =
  "features/cabinetry/components/CabinetPreviewRenderer3D.tsx";
const previewScenePath =
  "features/cabinetry/components/CabinetPreviewScene3D.tsx";
const designItemRendererContractPath =
  "features/cabinetry/components/CabinetDesignItemRenderer.contract.ts";
const designItemPlanRendererPath =
  "features/cabinetry/components/CabinetDesignItemPlan2D.tsx";
const designItemSpatialRendererPath =
  "features/cabinetry/components/CabinetDesignItemSpatial3D.tsx";
const sceneItemPath =
  "features/cabinetry/components/CabinetSceneItem.tsx";
const sceneResourceOwnershipPath =
  "features/cabinetry/hooks/useCabinetSceneResourceOwnership.ts";
const uiComponentPaths = [
  "features/cabinetry/components/CabinetStudioNavigator.tsx",
  "features/cabinetry/components/CabinetAssemblyInspector.tsx",
  "features/cabinetry/components/CabinetPartInspector.tsx",
  "features/cabinetry/components/CabinetStudioDetailedPreviews.tsx",
  "features/cabinetry/components/CabinetGuidedPreviewPanel.tsx",
  "features/cabinetry/components/CabinetGuidedReviewPanel.tsx",
  "features/cabinetry/components/CabinetGuidedActionFooter.tsx",
  "features/cabinetry/components/CabinetProductionOutputs.tsx",
  "features/cabinetry/components/CabinetStudioOutputsPanel.tsx",
];
const presentationPaths = [...modeViewPaths, ...uiComponentPaths];
const controllerHookPaths = [
  moduleReorderDragPath,
  customSpacesHookPath,
  measurementDraftsHookPath,
  preferencesHookPath,
  propertyFocusHookPath,
  selectionControllerPath,
  validationExposureHookPath,
];
const overlayPath =
  "components/editor/design-page/CabinetryStudioOverlay.tsx";
const storagePath =
  "features/cabinetry/storage/CabinetStudioLocalStorage.ts";
const failures = [];

const source = (relativePath) =>
  readFileSync(join(root, relativePath), "utf8");

function physicalLineCount(relativePath) {
  const contents = source(relativePath).replaceAll("\r\n", "\n");
  if (contents.length === 0) return 0;
  return contents.endsWith("\n")
    ? contents.slice(0, -1).split("\n").length
    : contents.split("\n").length;
}

// These are accepted Phase 1 checkpoints, not aspirational size targets. Lower
// the limits after a reviewed extraction; never raise them incidentally.
const lineLimits = new Map([
  [studioPath, 2_750],
  [guidedViewPath, 2_050],
  [detailedViewPath, 3_400],
  [contractPath, 80],
  [configPath, 220],
  [studioTypesPath, 80],
  [calculationsPath, 100],
  [selectorsPath, 375],
  [analyticsPath, 80],
  [documentIOPath, 240],
  [historyPath, 120],
  [definitionCommandsPath, 300],
  [moduleReorderDragPath, 120],
  [customSpacesHookPath, 100],
  [measurementDraftsHookPath, 100],
  [preferencesHookPath, 200],
  [propertyFocusHookPath, 150],
  [selectionControllerPath, 150],
  [validationExposureHookPath, 100],
  [previewInteractionControllerPath, 150],
  [uiComponentPaths[0], 400],
  [uiComponentPaths[1], 150],
  [uiComponentPaths[2], 700],
  [uiComponentPaths[3], 220],
  [uiComponentPaths[4], 180],
  [uiComponentPaths[5], 300],
  [uiComponentPaths[6], 200],
  [uiComponentPaths[7], 650],
  [uiComponentPaths[8], 450],
  ["features/cabinetry/components/CabinetGuidedStepNavigation.tsx", 250],
  ["features/cabinetry/components/CabinetOutputTabs.tsx", 250],
  [previewAdapterPath, 150],
  [previewRendererPath, 120],
  [previewScenePath, 160],
  [designItemRendererContractPath, 30],
  [designItemPlanRendererPath, 60],
  [designItemSpatialRendererPath, 60],
  [sceneItemPath, 400],
  [sceneResourceOwnershipPath, 130],
  ["features/cabinetry/components/CabinetStudioFormPrimitives.tsx", 250],
  ["features/cabinetry/components/CabinetStudioHeader.tsx", 250],
  ["features/cabinetry/components/CabinetTemplateDiagrams.tsx", 300],
  ["features/cabinetry/components/CabinetValidationFeedback.tsx", 250],
  [storagePath, 300],
]);

for (const [relativePath, limit] of lineLimits) {
  const count = physicalLineCount(relativePath);
  if (count > limit) {
    failures.push(
      `${relativePath} has ${count} physical lines; Phase 1 limit is ${limit}.`
    );
  }
}

const studioSource = source(studioPath);
for (const requiredBoundary of [
  "CabinetryStudio.config",
  "CabinetryStudio.calculations",
  "CabinetryStudio.selectors",
  "CabinetryStudio.types",
  "CabinetStudioAnalytics",
  "CabinetStudioDocumentIO",
  "CabinetStudioHistory",
  "CabinetStudioDefinitionCommands",
  "useCabinetModuleReorderDrag",
  "useCabinetStudioCustomSpaces",
  "useCabinetStudioMeasurementDrafts",
  "useCabinetStudioPreferences",
  "useCabinetStudioPropertyFocus",
  "useCabinetStudioSelectionController",
  "useCabinetStudioValidationExposure",
  "CabinetGuidedStepNavigation",
  "CabinetOutputTabs",
  "CabinetStudioLocalStorage",
  "CabinetryStudioGuidedView",
  "CabinetryStudioDetailedView",
]) {
  if (!studioSource.includes(requiredBoundary)) {
    failures.push(`CabinetryStudio must retain the ${requiredBoundary} boundary.`);
  }
}

const guidedViewSource = source(guidedViewPath);
const detailedViewSource = source(detailedViewPath);
for (const [viewPath, viewSource, experience, boundaries] of [
  [
    guidedViewPath,
    guidedViewSource,
    "guided",
    [
      "CabinetStudioHeader",
      "CabinetGuidedStepNavigation",
      "CabinetGuidedPreviewPanel",
      "CabinetGuidedReviewPanel",
      "CabinetGuidedActionFooter",
    ],
  ],
  [
    detailedViewPath,
    detailedViewSource,
    "detailed",
    [
      "CabinetStudioHeader",
      "CabinetStudioNavigator",
      "CabinetAssemblyInspector",
      "CabinetPartInspector",
      "CabinetDetailedCompactPreview",
      "CabinetDetailedPreviewPanel",
      "CabinetStudioOutputsPanel",
    ],
  ],
]) {
  if (!viewSource.includes(`data-experience="${experience}"`)) {
    failures.push(`${viewPath} must retain the ${experience} experience marker.`);
  }
  for (const boundary of boundaries) {
    if (!viewSource.includes(boundary)) {
      failures.push(`${viewPath} must retain the ${boundary} boundary.`);
    }
  }
}

if (studioSource.includes('data-experience="')) {
  failures.push(
    "CabinetryStudio must remain a coordinator and keep mode-view markup in its view boundaries."
  );
}

for (const previewOwnerPath of [uiComponentPaths[3], uiComponentPaths[4]]) {
  if (!source(previewOwnerPath).includes("CabinetStudioPreviewInteractionController")) {
    failures.push(
      `${previewOwnerPath} must retain the high-frequency preview interaction boundary.`
    );
  }
}

if (
  !studioSource.includes(
    'export type { CabinetryStudioProps } from "./CabinetryStudio.contract"'
  )
) {
  failures.push(
    "CabinetryStudio must preserve its named CabinetryStudioProps export."
  );
}

const directStudioStorageReferences =
  studioSource.match(/window\.localStorage/g)?.length ?? 0;
if (directStudioStorageReferences > 0) {
  failures.push(
    `CabinetryStudio has ${directStudioStorageReferences} direct window.localStorage references; the Batch 6 UI baseline is 0.`
  );
}

for (const uiComponentPath of presentationPaths) {
  const uiSource = source(uiComponentPath);
  for (const forbiddenUiImplementation of [
    /from ["'][^"']*\/CabinetryStudio["']/,
    /from ["'][^"']*\/(?:storage|infrastructure)\//,
    /window\.localStorage/,
    /\b(?:read|write)SavedCabinetTemplates\b/,
    /\bemitCabinetStudioAnalytics\b/,
    /\bcreateCabinetStudioPlacementPayload\b/,
    /\bgenerateCabinetParts\b/,
    /\bsetDefinition\(/,
  ]) {
    if (forbiddenUiImplementation.test(uiSource)) {
      failures.push(
        `${uiComponentPath} must remain a presentation boundary with explicit inputs and callbacks (${forbiddenUiImplementation}).`
      );
    }
  }
}

for (const modeViewPath of modeViewPaths) {
  const modeViewSource = source(modeViewPath);
  if (
    !modeViewSource.includes(
      `export type CabinetryStudio${
        modeViewPath === guidedViewPath ? "Guided" : "Detailed"
      }ViewBindings = readonly [`
    )
  ) {
    failures.push(`${modeViewPath} must retain its explicit view-binding contract.`);
  }
  if (/\buse(?:State|Effect|Memo|Ref|Callback|DeferredValue)\b/.test(modeViewSource)) {
    failures.push(`${modeViewPath} must remain free of React state and lifecycle hooks.`);
  }
}

for (const extractedUiMarker of [
  "cabinet-detailed-compact-preview",
  "cabinet-assembly-inspector",
  "cabinet-part-inspector",
  "cabinet-guided-review-panel",
  "cabinet-preview-status",
  "cabinet-output-panel",
  "cabinet-quote-summary",
  "cabinet-cut-list",
]) {
  if (studioSource.includes(extractedUiMarker)) {
    failures.push(
      `CabinetryStudio must keep ${extractedUiMarker} behind its Batch 6 UI component boundary.`
    );
  }
}

const storageSource = source(storagePath);
for (const forbiddenStorageDependency of [
  /from ["']react["']/,
  /from ["']next\//,
  /from ["']three["']/,
  /from ["']@react-three\//,
  /components\/CabinetryStudio["']/,
]) {
  if (forbiddenStorageDependency.test(storageSource)) {
    failures.push(
      `CabinetStudioLocalStorage must remain independent of UI and rendering modules (${forbiddenStorageDependency}).`
    );
  }
}

const contractSource = source(contractPath);
if (/^import\s+(?!type\b)/m.test(contractSource)) {
  failures.push("CabinetryStudio.contract must contain type-only imports.");
}

const studioTypesSource = source(studioTypesPath);
if (/^import\s+(?!type\b)/m.test(studioTypesSource)) {
  failures.push("CabinetryStudio.types must contain type-only imports.");
}

const configSource = source(configPath);
for (const forbiddenConfigDependency of [
  /from ["']react["']/,
  /from ["']next\//,
  /from ["']three["']/,
  /from ["']@react-three\//,
  /components\/CabinetryStudio/,
]) {
  if (forbiddenConfigDependency.test(configSource)) {
    failures.push(
      `CabinetryStudio.config must remain independent of UI and rendering modules (${forbiddenConfigDependency}).`
    );
  }
}

for (const pureModulePath of [calculationsPath, selectorsPath]) {
  const pureModuleSource = source(pureModulePath);
  for (const forbiddenPureDependency of [
    /from ["']react["']/,
    /from ["']next\//,
    /from ["']three["']/,
    /from ["']@react-three\//,
    /\b(?:window|document|localStorage|sessionStorage|fetch)\b/,
  ]) {
    if (forbiddenPureDependency.test(pureModuleSource)) {
      failures.push(
        `${pureModulePath} must remain free of UI and browser side effects (${forbiddenPureDependency}).`
      );
    }
  }
}

for (const infrastructurePath of [analyticsPath, documentIOPath]) {
  const infrastructureSource = source(infrastructurePath);
  for (const forbiddenInfrastructureDependency of [
    /from ["']react["']/,
    /from ["']next\//,
    /components\/CabinetryStudio/,
  ]) {
    if (forbiddenInfrastructureDependency.test(infrastructureSource)) {
      failures.push(
        `${infrastructurePath} must remain independent of the Studio UI (${forbiddenInfrastructureDependency}).`
      );
    }
  }
}

for (const stateModulePath of [historyPath, definitionCommandsPath]) {
  const stateModuleSource = source(stateModulePath);
  for (const forbiddenStateDependency of [
    /from ["']react["']/,
    /from ["']next\//,
    /from ["'][^"']*components\//,
    /\b(?:window|document|localStorage|sessionStorage|fetch)\b/,
    /\b(?:createContext|useReducer|useState|zustand|redux)\b/,
  ]) {
    if (forbiddenStateDependency.test(stateModuleSource)) {
      failures.push(
        `${stateModulePath} must remain a pure, framework-independent state boundary (${forbiddenStateDependency}).`
      );
    }
  }
}

for (const extractedStateImplementation of [
  "const patchFields = Object.keys(patch)",
  "getCabinetDrawerFrontLayouts",
  "resizeCabinetDrawerHeightProportions",
  "CABINET_MAX_MODULE_WIDTH_MM",
]) {
  if (studioSource.includes(extractedStateImplementation)) {
    failures.push(
      `CabinetryStudio must keep ${extractedStateImplementation} behind its state command boundary.`
    );
  }
}

for (const controllerHookPath of controllerHookPaths) {
  const controllerHookSource = source(controllerHookPath);
  for (const forbiddenControllerDependency of [
    /from ["']next\//,
    /from ["']three["']/,
    /from ["']@react-three\//,
    /from ["'][^"']*components\/CabinetryStudio["']/,
  ]) {
    if (forbiddenControllerDependency.test(controllerHookSource)) {
      failures.push(
        `${controllerHookPath} must remain independent of Next, 3D rendering, and the Studio composition root (${forbiddenControllerDependency}).`
      );
    }
  }
}

for (const extractedControllerImplementation of [
  "setPendingPropertyControlFocus",
  "setDraggedModuleId",
  "measurementUnitRef",
  "validationExposureStateRef",
  "readCabinetInspectorPreferences",
  "readStoredCabinetCustomSpaces",
  "setDimensionPreview",
  "setSemanticEditPreview",
]) {
  if (studioSource.includes(extractedControllerImplementation)) {
    failures.push(
      `CabinetryStudio must keep ${extractedControllerImplementation} behind its Batch 5 controller boundary.`
    );
  }
}

const propertyFocusHookSource = source(propertyFocusHookPath);
if (
  !propertyFocusHookSource.includes("window.requestAnimationFrame") ||
  !propertyFocusHookSource.includes("window.cancelAnimationFrame")
) {
  failures.push(
    "Cabinet Studio property-focus animation-frame registration must retain paired cancellation."
  );
}

const moduleReorderDragSource = source(moduleReorderDragPath);
const dragOverImplementation = moduleReorderDragSource.match(
  /const onModuleDragOver = useCallback\([\s\S]*?\n  \);/
)?.[0];
if (!dragOverImplementation || dragOverImplementation.includes("setDraggedModuleId")) {
  failures.push(
    "Cabinet module drag-over must remain free of React state updates."
  );
}

const previewInteractionControllerSource = source(
  previewInteractionControllerPath
);
for (const transientPreviewOwner of [
  "setDimensionPreview",
  "setSemanticEditPreview",
]) {
  if (!previewInteractionControllerSource.includes(transientPreviewOwner)) {
    failures.push(
      `${previewInteractionControllerPath} must retain local ${transientPreviewOwner} ownership.`
    );
  }
}

const previewAdapterSource = source(previewAdapterPath);
if (
  !previewAdapterSource.includes("CabinetPreviewRenderer3D") ||
  !previewAdapterSource.includes("CabinetPreviewScene3D")
) {
  failures.push(
    "CabinetPreview3D must compose separate renderer-initialization and scene-synchronization boundaries."
  );
}
for (const forbiddenPreviewAdapterDetail of [
  /<Canvas/,
  /\buseFrame\(/,
  /\buseThree\(/,
  /<Environment/,
  /<OrbitControls/,
]) {
  if (forbiddenPreviewAdapterDetail.test(previewAdapterSource)) {
    failures.push(
      `CabinetPreview3D must not regain direct renderer or scene-detail ownership (${forbiddenPreviewAdapterDetail}).`
    );
  }
}

const previewRendererSource = source(previewRendererPath);
const previewSceneSource = source(previewScenePath);
if (!previewRendererSource.includes("<Canvas") || !previewRendererSource.includes("useFrame")) {
  failures.push(
    "CabinetPreviewRenderer3D must retain Canvas initialization and readiness-loop ownership."
  );
}
if (
  !previewSceneSource.includes("<CabinetPreviewCameraController") ||
  !previewSceneSource.includes("<CabinetSceneItem") ||
  !previewSceneSource.includes("<OrbitControls")
) {
  failures.push(
    "CabinetPreviewScene3D must retain camera, cabinet-scene, and orbit-control synchronization."
  );
}

const designItemRendererContractSource = source(designItemRendererContractPath);
if (/^import\s+(?!type\b)/m.test(designItemRendererContractSource)) {
  failures.push("CabinetDesignItemRenderer.contract must contain type-only imports.");
}
for (const [rendererPath, projection, viewMode] of [
  [designItemPlanRendererPath, "plan", "2d"],
  [designItemSpatialRendererPath, "spatial", "3d"],
]) {
  const rendererSource = source(rendererPath);
  if (
    !rendererSource.includes(`projectSceneRoomItem(sceneEntry, "${projection}")`) ||
    !rendererSource.includes(`viewMode="${viewMode}"`)
  ) {
    failures.push(
      `${rendererPath} must retain its ${projection}/${viewMode} renderer mapping.`
    );
  }
  for (const forbiddenRendererPolicy of [
    /from ["'][^"']*\/(?:state|storage|infrastructure)\//,
    /\b(?:price|checkout|subscription|authentication|persistence|localStorage|fetch)\b/i,
  ]) {
    if (forbiddenRendererPolicy.test(rendererSource)) {
      failures.push(
        `${rendererPath} must consume projected domain state without business policy (${forbiddenRendererPolicy}).`
      );
    }
  }
}

const sceneItemSource = source(sceneItemPath);
const sceneResourceOwnershipSource = source(sceneResourceOwnershipPath);
if (!sceneItemSource.includes("useCabinetSceneResourceOwnership")) {
  failures.push(
    "CabinetSceneItem must delegate generated Three.js resource ownership to its lifecycle hook."
  );
}
for (const forbiddenSceneItemLifecycle of [
  /new THREE\.TextureLoader\(/,
  /loadedTextures/,
  /\.geometry\?\.dispose\(/,
]) {
  if (forbiddenSceneItemLifecycle.test(sceneItemSource)) {
    failures.push(
      `CabinetSceneItem must not duplicate extracted resource lifecycle logic (${forbiddenSceneItemLifecycle}).`
    );
  }
}
for (const requiredCleanupMarker of [
  "disposeCabinetObject3DResources(assembly)",
  "disposeCabinetObject3DResources(previewFrontEdges)",
  "if (cancelled)",
  "texture.dispose()",
  "disposeCabinetOwnedTextures(loadedTextures)",
]) {
  if (!sceneResourceOwnershipSource.includes(requiredCleanupMarker)) {
    failures.push(
      `${sceneResourceOwnershipPath} must retain cleanup marker ${requiredCleanupMarker}.`
    );
  }
}

for (const forbiddenDirectStudioInfrastructure of [
  'from "@/lib/analytics"',
  'from "../exportCabinetGlb"',
  'from "../exportCabinetFabricationDxf"',
  'from "../exportCabinetShopDrawingSvg"',
  'from "../importPolicy"',
  "parseCabinetSourceDefinitionJson",
]) {
  if (studioSource.includes(forbiddenDirectStudioInfrastructure)) {
    failures.push(
      `CabinetryStudio must keep ${forbiddenDirectStudioInfrastructure} behind its infrastructure adapters.`
    );
  }
}

const overlaySource = source(overlayPath);
if (
  !overlaySource.includes(
    'import type { CabinetryStudioProps } from "@/features/cabinetry/components/CabinetryStudio.contract"'
  )
) {
  failures.push(
    "CabinetryStudioOverlay must consume the type-only Studio contract."
  );
}
if (
  !/dynamic<CabinetryStudioProps>[\s\S]*?import\(["']@\/features\/cabinetry\/components\/CabinetryStudio["']\)/.test(
    overlaySource
  )
) {
  failures.push(
    "CabinetryStudioOverlay must keep the Studio implementation behind next/dynamic."
  );
}
if (
  /import\s+(?:CabinetryStudio|\{[^}]*CabinetryStudio[^}]*\})\s+from\s+["']@\/features\/cabinetry\/components\/CabinetryStudio["']/.test(
    overlaySource
  )
) {
  failures.push("CabinetryStudioOverlay must not eagerly import CabinetryStudio.");
}

function walkSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(absolutePath));
    } else if (
      [".ts", ".tsx"].includes(extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(resolve(absolutePath));
    }
  }
  return files;
}

const cabinetryFiles = walkSourceFiles(featureRoot);
const cabinetryFileSet = new Set(cabinetryFiles);

function resolveLocalImport(importer, specifier) {
  let candidate;
  if (specifier.startsWith("@/")) {
    candidate = join(root, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidate = resolve(dirname(importer), specifier);
  } else {
    return null;
  }

  for (const resolvedCandidate of [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    join(candidate, "index.ts"),
    join(candidate, "index.tsx"),
  ]) {
    if (existsSync(resolvedCandidate) && statSync(resolvedCandidate).isFile()) {
      return resolve(resolvedCandidate);
    }
  }
  return null;
}

function runtimeImportSpecifiers(contents) {
  const result = new Set();
  // Type-only edges disappear at runtime and cannot create initialization
  // cycles. Dynamic imports are deliberate async boundaries and are excluded.
  const pattern =
    /\b(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of contents.matchAll(pattern)) result.add(match[1]);
  return result;
}

const graph = new Map();
for (const file of cabinetryFiles) {
  const contents = readFileSync(file, "utf8");
  const dependencies = [...runtimeImportSpecifiers(contents)]
    .map((specifier) => resolveLocalImport(file, specifier))
    .filter((dependency) => dependency && cabinetryFileSet.has(dependency));
  graph.set(file, dependencies);

  if (file !== resolve(root, studioPath)) {
    const projectPath = relative(root, file).replaceAll("\\", "/");
    if (
      /(?:from\s+|import\()["'][^"']*\/CabinetryStudio["']/.test(contents)
    ) {
      failures.push(
        `${projectPath} must not import the CabinetryStudio composition root.`
      );
    }
  }
}

let nextIndex = 0;
const indexes = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const components = [];

function visit(file) {
  indexes.set(file, nextIndex);
  lowLinks.set(file, nextIndex);
  nextIndex += 1;
  stack.push(file);
  onStack.add(file);

  for (const dependency of graph.get(file) ?? []) {
    if (!indexes.has(dependency)) {
      visit(dependency);
      lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)));
    } else if (onStack.has(dependency)) {
      lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(dependency)));
    }
  }

  if (lowLinks.get(file) !== indexes.get(file)) return;
  const component = [];
  let member;
  do {
    member = stack.pop();
    onStack.delete(member);
    component.push(member);
  } while (member !== file);
  components.push(component);
}

for (const file of cabinetryFiles) {
  if (!indexes.has(file)) visit(file);
}

const cycles = components.filter((component) => {
  if (component.length > 1) return true;
  return (graph.get(component[0]) ?? []).includes(component[0]);
});
for (const cycle of cycles) {
  failures.push(
    `Cabinetry runtime dependency cycle detected: ${cycle
      .map((file) => relative(root, file).replaceAll("\\", "/"))
      .sort()
      .join(" -> ")}`
  );
}

if (failures.length > 0) {
  console.error("Cabinetry Studio architecture checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Cabinetry Studio architecture checks passed (${cabinetryFiles.length} feature source files, ${physicalLineCount(studioPath).toLocaleString("en-US")}-line coordinator, ${physicalLineCount(guidedViewPath).toLocaleString("en-US")}-line Guided view, ${physicalLineCount(detailedViewPath).toLocaleString("en-US")}-line Detailed view, no runtime dependency cycles).`
);
