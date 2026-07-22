import type { ProductPerformanceMetric, ProductTelemetryEvent } from "@/lib/product-telemetry";

export type ProductMetricDefinition = {
  id: string;
  description: string;
  calculation: string;
  sourceEvents: ProductTelemetryEvent[];
  targetPolicy: "baseline_first" | "human_evidence";
};

export const PRODUCT_METRIC_DEFINITIONS: ProductMetricDefinition[] = [
  { id: "activation", description: "A project reaches a trustworthy first placed product.", calculation: "Distinct editing sessions with project_started, room_dimensions_completed, and product_placed / sessions with project_started.", sourceEvents: ["project_started", "room_dimensions_completed", "product_placed"], targetPolicy: "baseline_first" },
  { id: "time_to_first_room", description: "Elapsed time from project start to the first completed room.", calculation: "room_dimensions_completed timestamp minus project_started timestamp for the same anonymous session.", sourceEvents: ["project_started", "room_dimensions_completed"], targetPolicy: "baseline_first" },
  { id: "time_to_first_placement", description: "Elapsed time from project start to first product placement.", calculation: "product_placed timestamp minus project_started timestamp for the same anonymous session.", sourceEvents: ["project_started", "product_placed"], targetPolicy: "baseline_first" },
  { id: "golden_path_completion", description: "Completion of room, placement, save, reload, share, shopping, and purchase-intent milestones.", calculation: "Sessions containing every golden-path event / activated sessions.", sourceEvents: ["room_dimensions_completed", "product_placed", "project_saved", "project_reloaded", "design_shared", "shopping_list_opened", "product_purchase_clicked"], targetPolicy: "baseline_first" },
  { id: "save_success", description: "Successful explicit save attempts.", calculation: "project_saved / (project_saved + project_save_failed).", sourceEvents: ["project_saved", "project_save_failed"], targetPolicy: "baseline_first" },
  { id: "reload_success", description: "Projects restored after a later editor load.", calculation: "project_reloaded / eligible returning project loads.", sourceEvents: ["project_reloaded"], targetPolicy: "baseline_first" },
  { id: "recovery_success", description: "Successful invalid/interrupted-backup recoveries.", calculation: "Successful project_recovered events / recovery attempts.", sourceEvents: ["project_recovered"], targetPolicy: "baseline_first" },
  { id: "crash_free_editing", description: "Editing sessions without an uncaught rendering or application crash.", calculation: "Crash-free editor sessions / editor sessions, joined to privacy-safe crash telemetry.", sourceEvents: ["project_started"], targetPolicy: "baseline_first" },
  { id: "view_success", description: "Projects successfully using consistent 2D and 3D views.", calculation: "Sessions with successful 2D and 3D view observations / activated sessions.", sourceEvents: ["view_switched_to_3d"], targetPolicy: "baseline_first" },
  { id: "shopping_list_engagement", description: "Activated projects that open the consolidated shopping list.", calculation: "Sessions with shopping_list_opened / activated sessions.", sourceEvents: ["shopping_list_opened"], targetPolicy: "baseline_first" },
  { id: "purchase_click_through", description: "Shopping-list sessions continuing to a supported purchase destination.", calculation: "Sessions with product_purchase_clicked / sessions with shopping_list_opened.", sourceEvents: ["shopping_list_opened", "product_purchase_clicked"], targetPolicy: "baseline_first" },
  { id: "returning_use", description: "Anonymous or authenticated editors returning to a saved project.", calculation: "Distinct returning sessions with project_reloaded / sessions with project_saved.", sourceEvents: ["project_saved", "project_reloaded"], targetPolicy: "baseline_first" },
  { id: "user_confidence", description: "Reviewer- or user-reported confidence after the golden path.", calculation: "Structured confidence response distribution tied to release evidence, never inferred from private project content.", sourceEvents: [], targetPolicy: "human_evidence" },
];

export type EditorPerformanceMetricDefinition = {
  metric: ProductPerformanceMetric;
  unit: "milliseconds" | "bytes" | "count";
  source: string;
  baselinePolicy: "observe_before_target" | "zero_tolerance";
};

export const EDITOR_PERFORMANCE_METRIC_DEFINITIONS: EditorPerformanceMetricDefinition[] = [
  { metric: "application_startup_ms", unit: "milliseconds", source: "Navigation Timing in the production browser benchmark.", baselinePolicy: "observe_before_target" },
  { metric: "editor_interactive_ms", unit: "milliseconds", source: "Navigation start to visible interactive scene canvas.", baselinePolicy: "observe_before_target" },
  { metric: "drag_latency_ms", unit: "milliseconds", source: "Pointer-sweep and transform-commit benchmark samples.", baselinePolicy: "observe_before_target" },
  { metric: "frame_duration_ms", unit: "milliseconds", source: "requestAnimationFrame p50/p95 samples.", baselinePolicy: "observe_before_target" },
  { metric: "scene_synchronization_ms", unit: "milliseconds", source: "Scene snapshot mutation to renderer marker synchronization.", baselinePolicy: "observe_before_target" },
  { metric: "save_duration_ms", unit: "milliseconds", source: "Local and cloud persistence timing.", baselinePolicy: "observe_before_target" },
  { metric: "load_duration_ms", unit: "milliseconds", source: "Representative project deserialize and hydration timing.", baselinePolicy: "observe_before_target" },
  { metric: "serialization_bytes", unit: "bytes", source: "UTF-8 stored design document size.", baselinePolicy: "observe_before_target" },
  { metric: "memory_growth_bytes", unit: "bytes", source: "Browser heap growth while a representative project is open.", baselinePolicy: "observe_before_target" },
  { metric: "memory_after_close_bytes", unit: "bytes", source: "Retained heap after closing a representative project and collecting garbage.", baselinePolicy: "observe_before_target" },
  { metric: "large_project_duration_ms", unit: "milliseconds", source: "Large representative project fingerprint, save, load, and interaction benchmarks.", baselinePolicy: "observe_before_target" },
  { metric: "asset_failure_count", unit: "count", source: "Product asset validator and browser asset-load failures.", baselinePolicy: "zero_tolerance" },
  { metric: "rendering_crash_count", unit: "count", source: "Privacy-safe application error and rendering crash telemetry.", baselinePolicy: "zero_tolerance" },
];
