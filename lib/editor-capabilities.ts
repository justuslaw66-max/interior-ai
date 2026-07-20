import type { Plan } from "@/lib/plan";

/**
 * Behavior-level editor capabilities used to shape the client experience.
 *
 * These flags are presentation and workflow policy, not authorization. API
 * routes must continue to validate server-side entitlements independently.
 */
export type EditorCapabilities = Readonly<{
  placeCatalogItems: boolean;
  useAdvancedTransforms: boolean;
  configurePlanLayers: boolean;
  viewTechnicalDimensions: boolean;
  createBasicAnnotations: boolean;
  createTechnicalAnnotations: boolean;
  customizeMaterials: boolean;
  importCad: boolean;
  tuneAdvancedRendering: boolean;
  applyAiSuggestions: boolean;
  useDesignerWorkspace: boolean;
  exportMultipleViews: boolean;
  exportPdf: boolean;
  exportWithoutWatermark: boolean;
  useCustomExportBranding: boolean;
  skipGuidedOnboarding: boolean;
  manageSubscription: boolean;
}>;

const CONSUMER_EDITOR_CAPABILITIES: EditorCapabilities = Object.freeze({
  placeCatalogItems: true,
  useAdvancedTransforms: false,
  configurePlanLayers: false,
  viewTechnicalDimensions: false,
  createBasicAnnotations: true,
  createTechnicalAnnotations: false,
  customizeMaterials: false,
  importCad: false,
  tuneAdvancedRendering: false,
  applyAiSuggestions: false,
  useDesignerWorkspace: false,
  exportMultipleViews: false,
  exportPdf: false,
  exportWithoutWatermark: false,
  useCustomExportBranding: false,
  skipGuidedOnboarding: false,
  manageSubscription: false,
});

const PROFESSIONAL_EDITOR_CAPABILITIES: EditorCapabilities = Object.freeze({
  placeCatalogItems: true,
  useAdvancedTransforms: true,
  configurePlanLayers: true,
  viewTechnicalDimensions: true,
  createBasicAnnotations: true,
  createTechnicalAnnotations: true,
  customizeMaterials: true,
  importCad: true,
  tuneAdvancedRendering: true,
  applyAiSuggestions: true,
  useDesignerWorkspace: true,
  exportMultipleViews: true,
  exportPdf: true,
  exportWithoutWatermark: true,
  useCustomExportBranding: true,
  skipGuidedOnboarding: true,
  manageSubscription: true,
});

export function resolveEditorCapabilities(
  plan?: Plan | string | null
): EditorCapabilities {
  return plan === "pro"
    ? PROFESSIONAL_EDITOR_CAPABILITIES
    : CONSUMER_EDITOR_CAPABILITIES;
}

export function getEditorPlanLabel(plan?: Plan | string | null): string {
  return plan === "pro" ? "Pro plan" : "Free plan";
}
