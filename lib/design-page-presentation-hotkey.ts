export type DesignPagePresentHotkeyCommand =
  | "toggle-client-preview"
  | null;

export function resolveDesignPagePresentHotkey({
  isDesigner,
  key,
}: {
  isDesigner: boolean;
  key: string;
}): DesignPagePresentHotkeyCommand {
  if (!isDesigner) return null;
  return key === "p" || key === "P" ? "toggle-client-preview" : null;
}
