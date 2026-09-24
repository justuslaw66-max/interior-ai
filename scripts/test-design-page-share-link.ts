import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { designApi } from "../lib/design-api-client";
import {
  createAndCopyShareLink,
  shareDesignSavingFirst,
  type ShareLinkUpdates,
} from "../lib/useDesignPageShareLink";

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

  // The Share button saves a design that isn't in the cloud yet, then shares the saved copy.
  const calls: string[] = [];
  const share = async (id: string) => {
    calls.push(`share:${id}`);
  };
  await shareDesignSavingFirst("design-4", async () => {
    calls.push("save");
    return "unused";
  }, share);
  assert.deepEqual(calls, ["share:design-4"], "A design already in the cloud should not be saved again.");
  calls.length = 0;
  await shareDesignSavingFirst(null, async () => {
    calls.push("save");
    return "design-5";
  }, share);
  assert.deepEqual(calls, ["save", "share:design-5"], "A new design should be saved, then shared.");
  calls.length = 0;
  await shareDesignSavingFirst(null, async () => {
    calls.push("save");
    return null;
  }, share);
  assert.deepEqual(calls, ["save"], "A failed save should not create a link.");

  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  assert.match(
    read("lib/useDesignPageEditorChromeController.ts"),
    /const share = \(\) => \{\s*if \(!commandState\.isAuthed\) return actions\.persistence\.openGuestPrompt\("share", \(\) => \{\}\);\s*void actions\.persistence\.shareDesign\(\);[\s\S]*?onShare: share,/,
    "Guests should get the sign-in prompt; signed-in users share.",
  );
  assert.match(
    read("lib/useDesignPageShareLink.ts"),
    /setShareLinkFallback\(fallback && \{ \.\.\.fallback, standalone: true \}\)/,
    "A link from the Share button should open its fallback dialog on its own.",
  );
  assert.match(
    read("components/editor/design-page/DesignPageDialogLayer.tsx"),
    /const open = \(parentOpen \|\| overlays\.shareFallback\.standalone\) && Boolean\(overlays\.shareFallback\.url\);/,
    "The fallback dialog should open for the Share button without Present & export.",
  );
  assert.match(
    read("lib/share-link-fallback-dialog-focus.ts"),
    /PRESENT_EXPORT_CLOSE_ACTION_ID,\s*GUEST_SHARE_OPENER_ID,/,
    "Closing a Share button fallback should return focus to Share.",
  );

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
