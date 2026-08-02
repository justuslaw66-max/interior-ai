/**
 * Export Tier Capabilities
 * 
 * Centralized UI capability logic for export features. Server routes still
 * enforce export entitlements independently.
 * Follow this rule: Never check user.plan directly in components.
 * Always use getExportCapabilities().
 */

import {
  getEditorPlanLabel,
  resolveEditorCapabilities,
} from "@/lib/editor-capabilities";

export type UserPlan = "free" | "pro";

export interface ExportCapabilities {
  // Visual
  watermark: boolean;
  customBranding: boolean;
  
  // Features
  pdfDownload: boolean;
  extendedAiNotes: boolean;
  
  // Fields
  clientNameField: boolean;
  designerLogoUpload: boolean;
  multiRoomCover: boolean;
  editableDesignerNotes: boolean;
}

/**
 * Get export capabilities based on user's plan
 */
export function getExportCapabilities(plan: UserPlan): ExportCapabilities {
  const capabilities = resolveEditorCapabilities(plan);
  
  return {
    // Free tier shows watermark, Pro removes it
    watermark: !capabilities.exportWithoutWatermark,
    
    // Pro-only features
    customBranding: capabilities.useCustomExportBranding,
    pdfDownload: capabilities.exportPdf,
    extendedAiNotes: capabilities.applyAiSuggestions,
    clientNameField: capabilities.useCustomExportBranding,
    designerLogoUpload: capabilities.useCustomExportBranding,
    multiRoomCover: capabilities.exportMultipleViews,
    editableDesignerNotes: capabilities.createTechnicalAnnotations,
  };
}

/**
 * Check if user has pro plan
 */
export function isProPlan(plan: UserPlan): boolean {
  return resolveEditorCapabilities(plan).manageSubscription;
}

/**
 * Get plan display name
 */
export function getPlanDisplayName(plan: UserPlan): string {
  return getEditorPlanLabel(plan).replace(" plan", "");
}

/**
 * Features locked behind Pro
 */
export const PRO_FEATURES = [
  "Remove watermark",
  "Add your branding",
  "Download as PDF",
  "Priority AI notes",
  "Custom client fields",
  "Designer logo upload",
] as const;
