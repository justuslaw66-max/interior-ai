import { runArchitecturalPresetContractTests } from "./cabinetry-tests/architectural-preset-contracts";
import { runCoreRenderingContractTests } from "./cabinetry-tests/core-rendering-contracts";
import { runExportBehaviorTests } from "./cabinetry-tests/export-behavior";
import { runFabricationContractTests } from "./cabinetry-tests/fabrication-contracts";
import { runLayoutAndValidationTests } from "./cabinetry-tests/layout-validation";
import { runPresetContractTests } from "./cabinetry-tests/preset-contracts";
import { runSpecialtyPresetContractTests } from "./cabinetry-tests/specialty-preset-contracts";

async function main(): Promise<void> {
  runLayoutAndValidationTests();
  runFabricationContractTests();
  runCoreRenderingContractTests();
  runSpecialtyPresetContractTests();
  runArchitecturalPresetContractTests();
  runPresetContractTests();
  await runExportBehaviorTests();
  console.log("Cabinetry tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
