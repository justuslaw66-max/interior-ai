import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { DesignPageCloudQaMarker } from "@/components/editor/design-page/DesignPageCloudQaMarker";
import { areRuntimeQaHooksEnabled } from "@/lib/qa";

const markerState = {
  cloudDesignId: "private-design-id",
  cloudRevision: "2026-09-03T02:00:00.000Z",
  cloudBaselineStatus: "acknowledged" as const,
};

const disabledMarkup = renderToStaticMarkup(
  <DesignPageCloudQaMarker qaHooksEnabled={false} {...markerState} />,
);
assert.equal(disabledMarkup, "");
assert.equal(disabledMarkup.includes(markerState.cloudDesignId), false);
assert.equal(disabledMarkup.includes(markerState.cloudRevision), false);
assert.equal(disabledMarkup.includes(markerState.cloudBaselineStatus), false);

const enabledMarkup = renderToStaticMarkup(
  <DesignPageCloudQaMarker qaHooksEnabled {...markerState} />,
);
assert.match(enabledMarkup, /data-testid="qa-editor-cloud-design"/);
assert.match(enabledMarkup, /data-design-id="private-design-id"/);
assert.match(enabledMarkup, /data-cloud-revision="2026-09-03T02:00:00.000Z"/);
assert.match(enabledMarkup, /data-cloud-baseline-status="acknowledged"/);

assert.equal(areRuntimeQaHooksEnabled({
  NODE_ENV: "development",
  NEXT_PUBLIC_ENABLE_QA_HOOKS: "0",
}), false);
assert.equal(areRuntimeQaHooksEnabled({
  NODE_ENV: "development",
  NEXT_PUBLIC_ENABLE_QA_HOOKS: "1",
}), true);
assert.equal(areRuntimeQaHooksEnabled({
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_ENV: "development",
  NEXT_PUBLIC_ENABLE_QA_HOOKS: "1",
}), true, "A development-targeted immutable preview may expose QA hooks.");
assert.equal(areRuntimeQaHooksEnabled({
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_ENV: "production",
  NEXT_PUBLIC_ENABLE_QA_HOOKS: "1",
}), false, "Production must stay fail-closed even with the public flag set.");
assert.equal(areRuntimeQaHooksEnabled({
  NEXT_PUBLIC_ENABLE_QA_HOOKS: "1",
}), false, "An unknown deployment environment must stay fail-closed.");
assert.equal(areRuntimeQaHooksEnabled({
  NODE_ENV: "development",
  NEXT_PUBLIC_ENABLE_QA_HOOKS: "?enableQaHooks=1",
}), false, "A user-controlled query value cannot enable QA hooks.");

console.log("design page cloud QA marker behavior checks passed");
