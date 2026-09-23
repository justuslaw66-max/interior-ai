import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CabinetMeasurementUnitProvider } from "../features/cabinetry/components/CabinetMeasurementUnitContext";
import { CabinetNumberField } from "../features/cabinetry/components/CabinetNumberField";
import { CabinetOverallDimensionHandles } from "../features/cabinetry/components/CabinetOverallDimensionHandles";
import { CabinetModuleDividerHandles } from "../features/cabinetry/components/CabinetModuleDividerHandles";
import { CabinetShelfMarkerHandles } from "../features/cabinetry/components/CabinetShelfMarkerHandles";
import { CabinetPreviewViewSelector } from "../features/cabinetry/components/CabinetPreviewCameraController";
import {
  CabinetDoorStylePreview,
  CabinetHandleTypePreview,
} from "../features/cabinetry/components/CabinetChoicePreviews";
import {
  CabinetDrawerConfigurationPreview,
  CabinetWallBedConfigurationPreview,
  CabinetWallPanelPatternPreview,
} from "../features/cabinetry/components/CabinetConfigurationPreviews";

function withUnit(unit: "mm" | "cm" | "in", child: ReturnType<typeof createElement>) {
  // Children is required by the provider's props type when using createElement in this .ts test.
  // eslint-disable-next-line react/no-children-prop
  return createElement(CabinetMeasurementUnitProvider, { unit, children: child });
}

const centimetreNumberField = renderToStaticMarkup(
  withUnit(
    "cm",
    createElement(CabinetNumberField, {
      label: "Overall width",
      value: 900,
      min: 200,
      max: 5000,
      step: 1,
      keyboardStep: 10,
      unit: "mm",
      testId: "unit-field",
      onCommit: () => undefined,
    })
  )
);
assert.match(centimetreNumberField, /role="spinbutton"/);
assert.match(centimetreNumberField, /value="90"/);
assert.match(centimetreNumberField, /data-model-value-mm="900"/);
assert.match(centimetreNumberField, /aria-valuenow="90"/);
assert.match(centimetreNumberField, /aria-valuemin="20"/);
assert.match(centimetreNumberField, /aria-valuemax="500"/);
assert.match(centimetreNumberField, /data-display-step="0\.01"/);
assert.match(centimetreNumberField, /data-keyboard-step="1"/);
assert.match(centimetreNumberField, />cm</);

const inchNumberField = renderToStaticMarkup(
  withUnit(
    "in",
    createElement(CabinetNumberField, {
      label: "Overall width",
      value: 900,
      min: 120,
      max: 1500,
      step: 1,
      keyboardStep: 10,
      unit: "mm",
      onCommit: () => undefined,
    })
  )
);
assert.match(inchNumberField, /value="35\.433"/);
assert.match(inchNumberField, /aria-valuemin="4\.724"/);
assert.match(inchNumberField, /aria-valuemax="59\.055"/);
assert.match(inchNumberField, /data-display-step="0\.001"/);
assert.match(inchNumberField, /data-keyboard-step="0\.394"/);

const inchOverallHandles = renderToStaticMarkup(
  withUnit(
    "in",
    createElement(CabinetOverallDimensionHandles, {
      widthMm: 900,
      heightMm: 720,
      depthMm: 560,
      onPreviewChange: () => undefined,
      onCommit: () => undefined,
    })
  )
);
assert.match(inchOverallHandles, /data-testid="cabinet-overall-dimension-handles"/);
assert.equal((inchOverallHandles.match(/role="slider"/g) ?? []).length, 3);
assert.match(inchOverallHandles, /aria-valuenow="35\.433"/);
assert.match(inchOverallHandles, /aria-valuemin="7\.874"/);
assert.match(inchOverallHandles, /aria-valuemax="787\.402"/);
assert.match(inchOverallHandles, /35\.433 in \(900 mm\)/);
assert.match(inchOverallHandles, /0\.394 in \(10 mm\)/);
assert.match(inchOverallHandles, /0\.039 in \(1 mm\)/);
assert.match(inchOverallHandles, /Use arrow keys/);

const centimetreDivider = renderToStaticMarkup(
  withUnit(
    "cm",
    createElement(CabinetModuleDividerHandles, {
      dividers: [
        {
          id: "divider-1",
          valueMm: 600,
          minMm: 200,
          maxMm: 1000,
          positionPercent: 50,
          label: "Divider between bay one and bay two",
        },
      ],
      onPreviewChange: () => undefined,
      onCommit: () => undefined,
    })
  )
);
assert.match(centimetreDivider, /aria-label="Divider between bay one and bay two"/);
assert.match(centimetreDivider, /aria-valuenow="60"/);
assert.match(centimetreDivider, /60 cm \(600 mm\)/);

const inchShelf = renderToStaticMarkup(
  withUnit(
    "in",
    createElement(CabinetShelfMarkerHandles, {
      shelves: [
        {
          id: "shelf-1",
          valueMm: 508,
          minMm: 100,
          maxMm: 1000,
          positionPercentFromBottom: 50,
          label: "Shelf one height",
        },
      ],
      onPreviewChange: () => undefined,
      onCommit: () => undefined,
    })
  )
);
assert.match(inchShelf, /aria-label="Shelf one height"/);
assert.match(inchShelf, /aria-valuenow="20"/);
assert.match(inchShelf, /20 in \(508 mm\)/);

const viewSelector = renderToStaticMarkup(
  createElement(CabinetPreviewViewSelector, {
    value: "front",
    onChange: () => undefined,
  })
);
assert.match(viewSelector, /role="group"/);
assert.equal((viewSelector.match(/aria-pressed="true"/g) ?? []).length, 1);
assert.match(viewSelector, /Use the arrow keys to move between views/);
assert.match(viewSelector, /✓/);

const decorativeDoor = renderToStaticMarkup(
  createElement(CabinetDoorStylePreview, { doorStyle: "shaker" })
);
assert.match(decorativeDoor, /aria-hidden="true"/);
const namedHandle = renderToStaticMarkup(
  createElement(CabinetHandleTypePreview, {
    handleType: "bar_pull",
    ariaLabel: "Bar pull preview",
  })
);
assert.match(namedHandle, /role="img"/);
assert.match(namedHandle, /aria-label="Bar pull preview"/);

const wallPanel = renderToStaticMarkup(
  createElement(CabinetWallPanelPatternPreview, {
    columns: 3,
    rows: 2,
    ariaLabel: "Three-column two-row wall panel pattern",
  })
);
assert.match(wallPanel, /data-cabinet-wall-panel-pattern="3x2"/);
assert.match(wallPanel, /role="img"/);
const drawerConfiguration = renderToStaticMarkup(
  createElement(CabinetDrawerConfigurationPreview, {
    mode: "recommended",
    drawerCount: 3,
    ariaLabel: "Recommended three-drawer height configuration",
  })
);
assert.match(drawerConfiguration, /data-cabinet-drawer-configuration="recommended:3"/);
assert.match(drawerConfiguration, /aria-label="Recommended three-drawer height configuration"/);
const wallBed = renderToStaticMarkup(
  createElement(CabinetWallBedConfigurationPreview, {
    mattressSize: "queen",
    orientation: "vertical",
    displayState: "open",
    sideStorage: "both",
    ariaLabel: "Open queen wall bed with storage on both sides",
  })
);
assert.match(wallBed, /data-cabinet-wall-bed-preview="queen:vertical:open:both"/);
assert.match(wallBed, /aria-label="Open queen wall bed with storage on both sides"/);

console.log(
  "Cabinetry static accessibility checks passed: units, spinbuttons, sliders, named views, and visual-choice semantics."
);
