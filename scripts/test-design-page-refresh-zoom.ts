import assert from "node:assert/strict";

import {
  DESIGN_PAGE_REFRESH_ZOOM_EPSILON,
  resolveDesignPageRefreshZoomTransform,
} from "../lib/design-page-refresh-zoom";

assert.equal(resolveDesignPageRefreshZoomTransform(null), null);
assert.equal(
  resolveDesignPageRefreshZoomTransform({
    scale: 1,
    offsetLeft: 0,
    offsetTop: 0,
  }),
  null
);
assert.equal(
  resolveDesignPageRefreshZoomTransform({
    scale: 1 + DESIGN_PAGE_REFRESH_ZOOM_EPSILON,
    offsetLeft: 0,
    offsetTop: 0,
  }),
  null
);

assert.deepEqual(
  resolveDesignPageRefreshZoomTransform({
    scale: 2,
    offsetLeft: 14,
    offsetTop: 9,
  }),
  {
    inverseScale: 0.5,
    transform: "translate3d(14px, 9px, 0) scale(0.5)",
  }
);

assert.deepEqual(
  resolveDesignPageRefreshZoomTransform({
    scale: 2.5,
    offsetLeft: Number.NaN,
    offsetTop: Number.POSITIVE_INFINITY,
  }),
  {
    inverseScale: 0.4,
    transform: "translate3d(0px, 0px, 0) scale(0.4)",
  }
);

console.log("Design-page refresh zoom tests passed.");
