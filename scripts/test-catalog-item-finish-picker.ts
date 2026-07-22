import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CatalogItemFinishPicker from "@/components/catalog/CatalogItemFinishPicker";

const markup = renderToStaticMarkup(
  createElement(CatalogItemFinishPicker, {
    activeFinishId: "fabric-stocked",
    onSetFinish: () => undefined,
    finishOptions: [
      {
        id: "fabric-stocked",
        label: "Stocked fabric",
        materialType: "Fabric" as const,
        collectionType: "stocked",
      },
      {
        id: "fabric-custom",
        label: "Custom fabric",
        materialType: "Fabric" as const,
        collectionType: "custom",
      },
      {
        id: "leather-stocked",
        label: "Stocked leather",
        materialType: "Leather" as const,
        collectionType: "stocked",
      },
      {
        id: "leather-custom",
        label: "Custom leather",
        materialType: "Leather" as const,
        collectionType: "custom",
      },
    ],
  })
);

assert.equal(
  (markup.match(/role="tablist"/g) ?? []).length,
  1,
  "stocked and custom finishes must share one material selector"
);
assert.match(
  markup,
  /data-testid="catalog-finish-picker"/,
  "the finish picker must retain a stable browser-test boundary"
);
assert.equal(
  (markup.match(/role="tab"/g) ?? []).length,
  2,
  "the shared selector must expose Fabric and Leather tabs"
);
assert.match(markup, /Stocked Fabrics:/, "the active material must show its stocked section");
assert.match(markup, /Custom Fabrics:/, "the active material must show its custom section");
assert.match(
  markup,
  /Create a piece made just for you in one of our custom fabrics\./,
  "the custom section must explain its made-to-order meaning"
);
assert.doesNotMatch(
  markup,
  /aria-label="Stocked leather"|aria-label="Custom leather"/,
  "inactive-material swatches must stay hidden until its shared tab is selected"
);

console.log("Catalog finish picker tests passed");
