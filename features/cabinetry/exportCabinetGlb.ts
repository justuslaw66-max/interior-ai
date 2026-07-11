import type { CabinetDefinition } from "./types";
import { createCabinetThreeGroup } from "./createCabinetThreeGroup";
import { generateCabinetParts } from "./generateCabinetParts";
import { validateCabinetDefinition } from "./validation";

export async function exportCabinetAsGlb(definition: CabinetDefinition): Promise<Blob> {
  const validation = validateCabinetDefinition(definition);
  if (!validation.valid) {
    throw new Error(validation.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("\n"));
  }

  const [{ GLTFExporter }] = await Promise.all([
    import("three/examples/jsm/exporters/GLTFExporter.js"),
  ]);
  const parts = generateCabinetParts(definition);
  const group = createCabinetThreeGroup(definition, parts);
  const exporter = new GLTFExporter();

  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        const json = JSON.stringify(result);
        resolve(new TextEncoder().encode(json).buffer as ArrayBuffer);
      },
      (error) => reject(error),
      {
        binary: true,
        includeCustomExtensions: true,
      }
    );
  });

  return new Blob([arrayBuffer], { type: "model/gltf-binary" });
}

export async function downloadCabinetGlb(definition: CabinetDefinition): Promise<void> {
  const blob = await exportCabinetAsGlb(definition);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "cabinet"}.glb`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
