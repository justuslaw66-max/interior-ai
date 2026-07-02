import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const root = process.cwd();
const libPath = path.join(root, "catalog", "furniture", "_upholstery_libraries", "dawson.yaml");
const doc = yaml.parse(fs.readFileSync(libPath, "utf8"));

const expectedFamilyByCode = {
  navagio_seagull: "linen_slub_weave",
  performance_creamy_white: "twill",
  indigo_blue: "twill",
  marcel_brilliant_white: "textured_plain_weave",
  peyton_ivory: "performance_fleece",
  peyton_dove_grey: "performance_fleece",
  marcel_smoke_grey: "textured_plain_weave",
  peyton_moss: "performance_fleece",
  peyton_cumin: "performance_fleece",
  infinity_boucle_ginger: "infinity_boucle",
  infinity_boucle_white_quartz: "infinity_boucle",
};

let missing = 0;
let familyMismatch = 0;
let options = 0;

for (const opt of doc.upholstery_options || []) {
  options += 1;
  const code = opt.upholstery_code;
  const assets = [
    ["swatch", opt.display_assets?.swatch_image],
    ["closeup", opt.display_assets?.closeup_image],
    ["base_color_map", opt.render_assets?.base_color_map],
    ["normal_map", opt.render_assets?.normal_map],
    ["roughness_map", opt.render_assets?.roughness_map],
  ];

  for (const [kind, rel] of assets) {
    if (!rel) {
      console.log(`MISSING_FIELD ${code} ${kind}`);
      missing += 1;
      continue;
    }
    const fullPath = path.join(root, "public", rel.replace(/^\//, ""));
    if (!fs.existsSync(fullPath)) {
      console.log(`MISSING_FILE ${code} ${kind} ${rel}`);
      missing += 1;
    }
  }

  const actualFamily = opt.render_assets?.material_family_key;
  const expectedFamily = expectedFamilyByCode[code];
  if (expectedFamily && actualFamily !== expectedFamily) {
    console.log(`FAMILY_MISMATCH ${code} expected=${expectedFamily} got=${actualFamily}`);
    familyMismatch += 1;
  }
}

console.log(`SUMMARY options=${options} missing=${missing} familyMismatch=${familyMismatch}`);
