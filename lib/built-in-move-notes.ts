/**
 * What a refused move, turn or drag of a built-in says. One that doesn't fit where it stands either (a run saved before its
 * room's rule, or one a panel added since cuts into) and has nowhere near to go is to be fitted again (J's delegate, 2 Nov 2026).
 */
export function getBuiltInRefusalNote(stuck: boolean, roomName: string, otherwise: string): string {
  return stuck ? `This built-in no longer fits where it stands in ${roomName}, and nothing near it fits. Use Fit to Space again to fit it to the room as it is now.` : otherwise;
}
