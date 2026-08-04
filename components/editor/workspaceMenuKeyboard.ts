import type { KeyboardEvent } from "react";

export function handleWorkspaceMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
  );
  if (items.length === 0) return;

  const activeIndex = items.indexOf(document.activeElement as HTMLElement);
  const direction = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (activeIndex + direction + items.length) % items.length;
  event.preventDefault();
  items[nextIndex].focus();
}
