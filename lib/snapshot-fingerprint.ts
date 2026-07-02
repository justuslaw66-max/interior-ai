import type { DesignSnapshot } from "@/lib/room-types";
import { migrateToV3 } from "@/lib/room-types";

const NOISY_KEYS = new Set(["timestamp", "updatedAt", "createdAt"]);

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== "object") return value;

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (NOISY_KEYS.has(key)) continue;
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) continue;
    normalized[key] = normalizeValue(entry);
  }
  return normalized;
}

function hashString(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function canonicalizeDesignSnapshot(snapshot: DesignSnapshot) {
  return normalizeValue(migrateToV3(snapshot));
}

export function serializeDesignSnapshotFingerprint(snapshot: DesignSnapshot) {
  return JSON.stringify(canonicalizeDesignSnapshot(snapshot));
}

export function fingerprintDesignSnapshot(snapshot: DesignSnapshot) {
  return hashString(serializeDesignSnapshotFingerprint(snapshot));
}
