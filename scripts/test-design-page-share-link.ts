import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { designApi } from "../lib/design-api-client";
import { createAndCopyShareLink, type ShareLinkUpdates } from "../lib/useDesignPageShareLink";

type Event = [string, unknown];

function recordingUpdates(events: Event[]): ShareLinkUpdates {
  const record = (name: string) => (value: unknown) => {
    events.push([name, value]);
  };
  return {
    setShareToken: record("shareToken"),
    setShareEnabled: record("shareEnabled"),
    setSharingDesign: record("sharing"),
    setShareSuccessToast: record("successToast"),
    setShareErrorToast: record("errorToast"),
    setShareLinkFallback: record("fallback"),
  };
}

const clipboardWrites: string[] = [];
let clipboardRefuses = false;
Object.defineProperty(globalThis, "window", {
  value: { location: { origin: "https://app.test" } },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: {
    clipboard: {
      writeText: async (text: string) => {
        if (clipboardRefuses) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
        clipboardWrites.push(text);
      },
    },
  },
  configurable: true,
});
// Feedback timers are recorded, not run, so the script ends as soon as the checks do.
const timers: Array<() => void> = [];
globalThis.setTimeout = ((callback: () => void) => {
  timers.push(callback);
  return 0;
}) as unknown as typeof setTimeout;
console.warn = () => undefined;

const sharedIds: string[] = [];
let shareFails = false;
designApi.share = (async (id: string) => {
  sharedIds.push(id);
  if (shareFails) throw new Error("Network down");
  return { shareToken: "token-1", shareEnabled: true };
}) as typeof designApi.share;

async function main() {
  let events: Event[] = [];
  await createAndCopyShareLink("design-1", recordingUpdates(events));
  assert.deepEqual(sharedIds, ["design-1"]);
  assert.deepEqual(clipboardWrites, ["https://app.test/share/token-1"]);
  assert.deepEqual(events, [
    ["sharing", true],
    ["shareToken", "token-1"],
    ["shareEnabled", true],
    ["successToast", true],
    ["sharing", false],
  ], "A copied link should store the token, confirm, and finish sharing.");
  timers.splice(0).forEach((run) => run());

  events = [];
  clipboardRefuses = true;
  const updates = recordingUpdates(events);
  await createAndCopyShareLink("design-2", updates);
  assert.deepEqual(events, [
    ["sharing", true],
    ["shareToken", "token-1"],
    ["shareEnabled", true],
    ["fallback", { designId: "design-2", url: "https://app.test/share/token-1" }],
    ["sharing", false],
  ], "A refused clipboard should hand the link to the fallback dialog.");
  assert.equal(timers.length, 0, "The fallback dialog needs no timed feedback.");

  events = [];
  shareFails = true;
  await createAndCopyShareLink("design-3", recordingUpdates(events));
  assert.equal(events[0]?.[0], "sharing");
  assert.equal(events[1]?.[0], "errorToast");
  assert.match(String(events[1]?.[1]), /^Failed to create share link: /);
  assert.deepEqual(events[2], ["sharing", false]);
  timers.splice(0).forEach((run) => run());
  assert.deepEqual(events.at(-1), ["errorToast", null], "The error should clear itself.");

  const persistenceSource = readFileSync(
    join(process.cwd(), "lib/useDesignPagePersistence.ts"),
    "utf8",
  );
  assert.match(
    persistenceSource,
    /useDesignPageShareLink\(\{ designId, setShareToken, setShareEnabled \}\)/,
    "The persistence hook should own share links through useDesignPageShareLink.",
  );
  assert.match(
    persistenceSource,
    /setIsSaving\(false\);\s*resetShareLink\(\);/,
    "Starting a new draft should clear any share link in flight.",
  );
  assert.doesNotMatch(
    persistenceSource,
    /designApi\.share\(designId\)/,
    "Share links should only be created in useDesignPageShareLink.",
  );

  console.log("Design-page share link checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
