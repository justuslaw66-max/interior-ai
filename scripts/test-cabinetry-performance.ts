import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createCabinetAutomationState } from "../features/cabinetry/automation";
import {
  CABINET_PRESET_OPTIONS,
  createCabinetPreset,
  type CabinetPresetId,
} from "../features/cabinetry/presets";
import type {
  CabinetBOMItem,
  CabinetDefinition,
  CabinetDocumentationSnapshot,
  CabinetPart,
} from "../features/cabinetry/types";

type GenerateCabinetParts = (
  definition: CabinetDefinition
) => CabinetPart[];
type GenerateCabinetBOM = (
  definition: CabinetDefinition,
  precomputedParts?: readonly CabinetPart[]
) => CabinetBOMItem[];
type GenerateCabinetDocumentation = (
  definition: CabinetDefinition,
  precomputed?: { readonly parts?: readonly CabinetPart[] }
) => CabinetDocumentationSnapshot;

// These mutable CommonJS module bindings provide a countable seam in this
// script's ts-node test runtime. Production APIs remain unchanged.
const loadCommonJsModule = createRequire(__filename);
const cabinetPartsModule = loadCommonJsModule("../features/cabinetry/generateCabinetParts") as {
  generateCabinetParts: GenerateCabinetParts;
};
const cabinetBomModule = loadCommonJsModule("../features/cabinetry/generateCabinetBOM") as {
  generateCabinetBOM: GenerateCabinetBOM;
};
const cabinetDocumentationModule = loadCommonJsModule(
  "../features/cabinetry/generateCabinetDocumentation"
) as {
  generateCabinetDocumentation: GenerateCabinetDocumentation;
};

const originalGenerateCabinetParts = cabinetPartsModule.generateCabinetParts;
const generateCabinetBOM = cabinetBomModule.generateCabinetBOM;
const generateCabinetDocumentation =
  cabinetDocumentationModule.generateCabinetDocumentation;

const LARGE_RUN_PRESET_IDS: readonly CabinetPresetId[] = [
  "base",
  "wall",
  "cabinet_run",
  "pantry_system",
  "vanity",
  "laundry_room",
  "home_office_built_in",
  "media_wall",
  "closet_system",
  "mudroom_storage",
];

const LARGE_RUN_SAMPLE_COUNT = 5;
const PRESET_SAMPLE_COUNT = 3;
const LARGE_RUN_GROSS_LIMIT_MS = 15_000;
const PRESET_GROSS_LIMIT_MS = 5_000;
const PRESET_SUITE_GROSS_LIMIT_MS = 60_000;

interface PipelineResult {
  parts: CabinetPart[];
  bom: CabinetBOMItem[];
  documentation: CabinetDocumentationSnapshot;
}

interface TimedResult<T> {
  elapsedMs: number;
  value: T;
}

function time<T>(operation: () => T): TimedResult<T> {
  const start = process.hrtime.bigint();
  const value = operation();
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
  return { elapsedMs, value };
}

function percentile(values: readonly number[], percentileValue: number): number {
  assert(values.length > 0, "A percentile requires at least one sample.");
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(percentileValue * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
}

function summarize(values: readonly number[]) {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`;
}

function runPipeline(definition: CabinetDefinition): PipelineResult {
  const parts = originalGenerateCabinetParts(definition);
  const bom = generateCabinetBOM(definition, parts);
  const documentation = generateCabinetDocumentation(definition, { parts });
  return { parts, bom, documentation };
}

function bomQuantity(bom: readonly CabinetBOMItem[]): number {
  return bom.reduce((sum, item) => sum + item.quantity, 0);
}

function assertPipelineCorrectness(
  definition: CabinetDefinition,
  result: PipelineResult
): void {
  assert(result.parts.length > 0, `${definition.name} should generate parts.`);
  assert(result.bom.length > 0, `${definition.name} should generate a BOM.`);
  assert.equal(
    bomQuantity(result.bom),
    result.parts.length,
    `${definition.name} BOM quantities should account for every generated part.`
  );
  assert(
    result.documentation.dimensionSchedule.length >= definition.modules.length + 1,
    `${definition.name} should document overall and module dimensions.`
  );
  assert(
    result.documentation.cutList.length > 0,
    `${definition.name} should generate a fabrication cut list.`
  );
  assert(
    Number.isFinite(result.documentation.quoteSummary.estimatedTotal),
    `${definition.name} should generate a finite quote estimate.`
  );
}

function createLargeCabinetRun(): CabinetDefinition {
  const base = createCabinetPreset("cabinet_run", "cabinet-performance-large-run");
  const modules = LARGE_RUN_PRESET_IDS.flatMap((presetId, presetIndex) => {
    const source = createCabinetPreset(
      presetId,
      `cabinet-performance-source-${presetId}`
    );
    return source.modules.map((module, moduleIndex) => ({
      ...module,
      id: `performance-module-${presetIndex + 1}-${moduleIndex + 1}`,
    }));
  });
  const definition: CabinetDefinition = {
    ...base,
    name: "Performance evidence - large mixed cabinetry run",
    totalWidth: modules.reduce((sum, module) => sum + module.width, 0),
    height: Math.max(...modules.map((module) => module.height)),
    depth: Math.max(...modules.map((module) => module.depth)),
    modules,
  };

  return {
    ...definition,
    automation: createCabinetAutomationState(definition),
  };
}

function assertLargeRunCoverage(result: PipelineResult): void {
  const partTypes = new Set(result.parts.map((part) => part.type));
  const requiredPartTypes = [
    "door_front",
    "drawer_front",
    "shelf",
    "handle",
    "door_hinge_pair",
    "drawer_slide_pair",
    "plumbing_chase_void",
    "laundry_utility_chase",
    "desk_power_chase",
    "media_cable_chase",
  ] as const;

  for (const partType of requiredPartTypes) {
    assert(
      partTypes.has(partType),
      `The large run should include ${partType} performance coverage.`
    );
  }
  assert(result.parts.length >= 200, "The large run should remain meaningfully large.");
  assert(
    result.documentation.hardwareSchedule.length >= 5,
    "The large run should exercise a varied hardware schedule."
  );
}

function assertPrecomputedPartParityAndReuse(
  definition: CabinetDefinition,
  parts: readonly CabinetPart[]
): void {
  const directBom = generateCabinetBOM(definition);
  const reusedBom = generateCabinetBOM(definition, parts);
  assert.deepEqual(reusedBom, directBom, "Precomputed parts must preserve BOM output parity.");

  const directDocumentation = generateCabinetDocumentation(definition);
  const reusedDocumentation = generateCabinetDocumentation(definition, { parts });
  assert.deepEqual(
    reusedDocumentation,
    directDocumentation,
    "Precomputed parts must preserve documentation output parity."
  );

  const sentinel: CabinetPart = {
    id: "performance-precomputed-sentinel",
    moduleId: definition.modules[0].id,
    type: "shelf",
    position: { x: 17, y: 19, z: 23 },
    size: { width: 731.2, height: 18, depth: 419.4 },
    materialId: definition.modules[0].materialId,
    metadata: { performanceSentinel: true },
  };
  const suppliedParts = [...parts, sentinel];
  const suppliedPartsBefore = JSON.stringify(suppliedParts);
  const sentinelBom = generateCabinetBOM(definition, suppliedParts);
  const sentinelDocumentation = generateCabinetDocumentation(definition, {
    parts: suppliedParts,
  });

  assert.equal(
    bomQuantity(sentinelBom),
    suppliedParts.length,
    "BOM generation should account for the caller-supplied sentinel part."
  );
  assert(
    sentinelDocumentation.cutList.some((item) => item.partId === sentinel.id),
    "Documentation should consume the caller-supplied sentinel part."
  );
  assert(
    !directDocumentation.cutList.some((item) => item.partId === sentinel.id),
    "A regenerated part list must not contain the caller-only sentinel."
  );
  assert.equal(
    JSON.stringify(suppliedParts),
    suppliedPartsBefore,
    "BOM and documentation generation must not mutate precomputed parts."
  );

  let generationCount = 0;
  cabinetPartsModule.generateCabinetParts = (candidate) => {
    generationCount += 1;
    return originalGenerateCabinetParts(candidate);
  };
  try {
    generateCabinetBOM(definition, parts);
    generateCabinetDocumentation(definition, { parts });
    assert.equal(
      generationCount,
      0,
      "Supplying parts to BOM and documentation should avoid regeneration."
    );

    generateCabinetBOM(definition);
    assert.equal(generationCount, 1, "A direct BOM should generate parts exactly once.");

    generateCabinetDocumentation(definition);
    assert.equal(
      generationCount,
      2,
      "A direct documentation snapshot should add exactly one parts generation pass."
    );
  } finally {
    cabinetPartsModule.generateCabinetParts = originalGenerateCabinetParts;
  }
}

function benchmarkLargeRun(definition: CabinetDefinition): number[] {
  runPipeline(definition);
  return Array.from({ length: LARGE_RUN_SAMPLE_COUNT }, () => {
    const sample = time(() => runPipeline(definition));
    assertPipelineCorrectness(definition, sample.value);
    assert(
      sample.elapsedMs < LARGE_RUN_GROSS_LIMIT_MS,
      `Large cabinetry pipeline exceeded the gross ${LARGE_RUN_GROSS_LIMIT_MS} ms limit: ${formatMs(sample.elapsedMs)}.`
    );
    return sample.elapsedMs;
  });
}

function benchmarkAllPresets(): Array<{ id: CabinetPresetId; medianMs: number }> {
  assert.equal(
    CABINET_PRESET_OPTIONS.length,
    33,
    "Performance coverage must include all 33 cabinetry presets."
  );
  const suiteStart = process.hrtime.bigint();
  const rows = CABINET_PRESET_OPTIONS.map(({ id }) => {
    const definition = createCabinetPreset(id, `cabinet-performance-${id}`);
    runPipeline(definition);
    const samples = Array.from({ length: PRESET_SAMPLE_COUNT }, () => {
      const sample = time(() => runPipeline(definition));
      assertPipelineCorrectness(definition, sample.value);
      assert(
        sample.elapsedMs < PRESET_GROSS_LIMIT_MS,
        `${id} exceeded the gross ${PRESET_GROSS_LIMIT_MS} ms preset limit: ${formatMs(sample.elapsedMs)}.`
      );
      return sample.elapsedMs;
    });
    return { id, medianMs: percentile(samples, 0.5) };
  });
  const suiteElapsedMs =
    Number(process.hrtime.bigint() - suiteStart) / 1_000_000;
  assert(
    suiteElapsedMs < PRESET_SUITE_GROSS_LIMIT_MS,
    `The all-preset suite exceeded the gross ${PRESET_SUITE_GROSS_LIMIT_MS} ms limit: ${formatMs(suiteElapsedMs)}.`
  );
  return rows;
}

function main(): void {
  const largeRun = createLargeCabinetRun();
  const definitionBefore = JSON.stringify(largeRun);
  const initialResult = runPipeline(largeRun);
  assertPipelineCorrectness(largeRun, initialResult);
  assertLargeRunCoverage(initialResult);
  assertPrecomputedPartParityAndReuse(largeRun, initialResult.parts);
  assert.equal(
    JSON.stringify(largeRun),
    definitionBefore,
    "The performance pipeline must not mutate its cabinetry definition."
  );

  const largeSamples = benchmarkLargeRun(largeRun);
  const largeSummary = summarize(largeSamples);
  const presetRows = benchmarkAllPresets();
  const presetSummary = summarize(presetRows.map((row) => row.medianMs));

  console.log(
    `Large run: ${largeRun.modules.length} modules, ${initialResult.parts.length} parts, ${initialResult.bom.length} BOM lines.`
  );
  console.log(
    `Large run pipeline (${LARGE_RUN_SAMPLE_COUNT} samples): p50 ${formatMs(largeSummary.p50)}, p95 ${formatMs(largeSummary.p95)}, max ${formatMs(largeSummary.max)}.`
  );
  console.log("All preset pipeline medians:");
  for (const row of presetRows) {
    console.log(`  ${row.id.padEnd(26)} ${formatMs(row.medianMs)}`);
  }
  console.log(
    `All 33 presets: p50 ${formatMs(presetSummary.p50)}, p95 ${formatMs(presetSummary.p95)}, max ${formatMs(presetSummary.max)}.`
  );
  console.log(
    "Cabinetry performance evidence passed: output parity, supplied-parts reuse, single-pass generation, and gross-regression bounds are intact."
  );
}

main();
