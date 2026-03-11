/**
 * Export Tier Capabilities
 * 
 * Centralized entitlement logic for export features.
 * Follow this rule: Never check user.plan directly in components.
 * Always use getExportCapabilities().
 */

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
  const isPro = plan === "pro";
  
  return {
    // Free tier shows watermark, Pro removes it
    watermark: !isPro,
    
    // Pro-only features
    customBranding: isPro,
    pdfDownload: isPro,
    extendedAiNotes: isPro,
    clientNameField: isPro,
    designerLogoUpload: isPro,
    multiRoomCover: isPro,
    editableDesignerNotes: isPro,
  };
}

/**
 * Check if user has pro plan
 */
export function isProPlan(plan: UserPlan): boolean {
  return plan === "pro";
}

/**
 * Get plan display name
 */
export function getPlanDisplayName(plan: UserPlan): string {
  return plan === "pro" ? "Pro" : "Free";
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
