import type { Dispatch, SetStateAction } from "react";

import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import {
  normalizeDesignPageLocalBackup,
  type NormalizeDesignPageLocalBackupInput,
} from "@/lib/design-page-local-backup";
import type { DesignPageCloudLoadResult } from "@/lib/design-page-types";
import type { DesignSnapshot } from "@/lib/room-types";

type DesignUrlContext = Pick<URLSearchParams, "get">;

export type RequestedDesignLoadCompletion =
  | { kind: "unchanged" }
  | { kind: "replace"; href: string };

/** Where the address goes after a requested design's load: unchanged, or the open design's own. */
export function resolveRequestedDesignLoadCompletion(input: {
  active: boolean;
  result: DesignPageCloudLoadResult;
  currentDesignId: string | null;
  context: DesignUrlContext;
}): RequestedDesignLoadCompletion {
  if (!input.active || input.result === "loaded" || input.result === "superseded") {
    return { kind: "unchanged" };
  }
  return {
    kind: "replace",
    href: input.currentDesignId
      ? buildDesignEditorUrl({
          designId: input.currentDesignId,
          context: input.context,
        })
      : "/design",
  };
}

/**
 * Opening a design by its link (`/design?designId=…`, as My designs does) while this browser's
 * backup holds a different design: the requested design opens first. Before, the backup showed
 * first and was checked against the cloud, and only then did the requested design load
 * (UX phase 4a).
 *
 * The backup stays as it is until the requested design has loaded, because backup writes wait for
 * hydration. Then the loaded design's backup replaces it, as it did when the backup opened first.
 * If the requested design can't be opened, the backup comes back as before, and the address names
 * the backup's design (or none), as the requested-design registration does after a failed load.
 */

export type RequestedDesignFirstInput = {
  state: Omit<NormalizeDesignPageLocalBackupInput["state"], "activeRoomId">;
  configuration: NormalizeDesignPageLocalBackupInput["configuration"];
  refs: { designSnapshot: { current: Pick<DesignSnapshot, "activeRoomId"> } };
  actions: {
    loadDesign: (id: string) => Promise<DesignPageCloudLoadResult>;
    setLocalBackupHydrated: Dispatch<SetStateAction<boolean>>;
  };
};

export type RequestedDesignFirstBrowser = {
  location: Pick<Location, "search">;
  history: Pick<History, "replaceState">;
};

/**
 * The cloud design a valid backup belongs to (null if never saved to the cloud), or undefined when
 * the backup isn't valid: the usual restore then offers recovery, as before.
 */
export function readLocalBackupDesignId(
  raw: string,
  input: Pick<RequestedDesignFirstInput, "state" | "configuration" | "refs">
): string | null | undefined {
  try {
    return normalizeDesignPageLocalBackup({
      rawBackup: raw,
      state: {
        ...input.state,
        activeRoomId: input.refs.designSnapshot.current.activeRoomId,
      },
      configuration: input.configuration,
    }).cloudDesignId;
  } catch {
    return undefined;
  }
}

export function shouldOpenRequestedDesignFirst(
  requestedDesignId: string,
  backupDesignId: string | null | undefined
): backupDesignId is string | null {
  return (
    Boolean(requestedDesignId) &&
    backupDesignId !== undefined &&
    backupDesignId !== requestedDesignId
  );
}

export async function openRequestedDesignThenBackup(input: {
  raw: string;
  requestedDesignId: string;
  backupDesignId: string | null;
  actions: RequestedDesignFirstInput["actions"];
  restoreRawBackup: (raw: string) => Promise<boolean>;
  browser: RequestedDesignFirstBrowser;
}): Promise<void> {
  const { raw, requestedDesignId, backupDesignId, actions, browser } = input;
  const result = await actions.loadDesign(requestedDesignId);
  if (result === "loaded" || result === "superseded") {
    actions.setLocalBackupHydrated(true);
    return;
  }
  const completion = resolveRequestedDesignLoadCompletion({
    active: true,
    result,
    currentDesignId: backupDesignId,
    context: new URLSearchParams(browser.location.search),
  });
  if (completion.kind === "replace") {
    browser.history.replaceState(null, "", completion.href);
  }
  await input.restoreRawBackup(raw);
}

/** Opens the requested design first when that applies; false leaves the backup to the usual restore. */
export function openRequestedDesignBeforeBackup(
  raw: string,
  input: RequestedDesignFirstInput,
  restoreRawBackup: (raw: string) => Promise<boolean>,
  browser: RequestedDesignFirstBrowser = window
): boolean {
  const requestedDesignId =
    new URLSearchParams(browser.location.search).get("designId") ?? "";
  if (!requestedDesignId) return false;
  const backupDesignId = readLocalBackupDesignId(raw, input);
  if (!shouldOpenRequestedDesignFirst(requestedDesignId, backupDesignId)) {
    return false;
  }
  void openRequestedDesignThenBackup({
    raw,
    requestedDesignId,
    backupDesignId,
    actions: input.actions,
    restoreRawBackup,
    browser,
  });
  return true;
}
