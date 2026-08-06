import {
  parseBrowserAnalyticsEventInput,
  type BrowserAuthorizedAnalyticsEventType,
} from "@/lib/app-event-provenance";

export type BrowserAppEventRecordInput = {
  eventType: BrowserAuthorizedAnalyticsEventType;
  userId: string | null;
  designId: string | null;
  shareToken: string | null;
  meta: Record<string, unknown> | null;
};

export type BrowserAppEventActor = { userId: string | null };

type BrowserAppEventRecordResult = {
  persisted: boolean;
  eventId: string | null;
};

export type BrowserAppEventIngestionDependencies = {
  findSharedDesignId: (shareToken: string) => Promise<string | null>;
  findOwnedDesignId: (designId: string, userId: string) => Promise<string | null>;
  recordBrowserEvent: (
    input: BrowserAppEventRecordInput
  ) => Promise<BrowserAppEventRecordResult>;
};

export type BrowserAppEventIngestionResult =
  | { ok: true; persisted: boolean; eventId: string | null }
  | { ok: false; error: "invalid_event" };

export async function ingestBrowserAppEvent(
  body: unknown,
  actor: BrowserAppEventActor,
  dependencies: BrowserAppEventIngestionDependencies
): Promise<BrowserAppEventIngestionResult> {
  const parsed = parseBrowserAnalyticsEventInput(body);
  if (!parsed.ok) return { ok: false, error: "invalid_event" };

  const { eventType, designId, shareToken, meta } = parsed.value;
  const { userId } = actor;
  let resolvedDesignId: string | null = null;
  let validatedShareToken: string | null = null;

  if (typeof shareToken === "string" && shareToken.length >= 20 && shareToken.length <= 128) {
    resolvedDesignId = await dependencies.findSharedDesignId(shareToken);
    if (resolvedDesignId) validatedShareToken = shareToken;
  } else if (
    userId &&
    typeof designId === "string" &&
    designId.length > 0 &&
    designId.length <= 64
  ) {
    resolvedDesignId = await dependencies.findOwnedDesignId(designId, userId);
  }

  const result = await dependencies.recordBrowserEvent({
    eventType,
    userId,
    designId: resolvedDesignId,
    shareToken: validatedShareToken,
    meta,
  });

  return { ok: true, persisted: result.persisted, eventId: result.eventId };
}
