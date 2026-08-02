import { registerDetailedTests } from "./cabinetry-studio/detailed";
import { registerExportTests } from "./cabinetry-studio/export";
import { registerGuidedTests } from "./cabinetry-studio/guided";
import { registerPlacementTests } from "./cabinetry-studio/placement";
import { registerSelectionTests } from "./cabinetry-studio/selection";

registerSelectionTests();
registerGuidedTests();
registerDetailedTests();
registerExportTests();
registerPlacementTests();
