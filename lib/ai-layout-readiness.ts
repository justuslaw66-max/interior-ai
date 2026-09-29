import { formatDisplayArea, type DisplayUnit } from "@/lib/display-units";

export type AiLayoutReadinessCheck = { label: string; ready: boolean; detail: string };

type AiLayoutReadinessInput = {
  roomSupported: boolean;
  roomArea: number;
  /** The first visit's room, untouched: its size is the default one, not a measurement (FR2). */
  roomIsDraft: boolean;
  mustHaveCount: number;
  measurementUnit: DisplayUnit;
};

function measuredRoomCheck({ roomArea, roomIsDraft, measurementUnit }: AiLayoutReadinessInput): AiLayoutReadinessCheck {
  if (roomIsDraft) return { label: "Measured room", ready: false, detail: "Default size" };
  if (roomArea > 0) return { label: "Measured room", ready: true, detail: formatDisplayArea(roomArea, measurementUnit) };
  return { label: "Measured room", ready: false, detail: "Add dimensions" };
}

/**
 * "Ready to generate" in Suggest a layout. A default-size room isn't called measured, though a
 * layout can still be suggested for it.
 */
export function aiLayoutReadinessChecks(input: AiLayoutReadinessInput): AiLayoutReadinessCheck[] {
  const { roomSupported, mustHaveCount } = input;
  return [
    { label: "Living room", ready: roomSupported, detail: roomSupported ? "Supported" : "Living rooms first" },
    measuredRoomCheck(input),
    {
      label: "Must-haves",
      ready: mustHaveCount > 0,
      detail: mustHaveCount > 0 ? `${mustHaveCount} selected` : "Pick at least one",
    },
  ];
}
