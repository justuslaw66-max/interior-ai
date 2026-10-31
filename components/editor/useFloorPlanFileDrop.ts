"use client";

import { useState, type DragEvent } from "react";

/** True when what is being dragged holds files from the desktop, not text or a link. */
function isFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * A file dragged from the desktop onto an element is chosen as if picked: the upload window's drop
 * box and its Choose file button. Only the first file is taken, as with the file input. While
 * `disabled`, the drop is left to `ignoreStrayFileDrop`.
 */
export function useFloorPlanFileDrop(disabled: boolean, onFileDropped: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  const allowDrop = (event: DragEvent<HTMLElement>) => {
    if (disabled || !isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  return {
    dragging,
    dropProps: {
      onDragEnter: allowDrop,
      onDragOver: allowDrop,
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) onFileDropped(file);
      },
    },
  };
}

function refuseFileDrop(event: DragEvent<HTMLElement>) {
  if (event.defaultPrevented || !isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "none";
}

/**
 * For the upload window as a whole: a file let go anywhere but a drop target is refused, so just
 * missing Choose file doesn't make the browser open the file in place of the design. A drop target
 * inside has already taken the event (`defaultPrevented`), so this leaves it alone.
 */
export const ignoreStrayFileDrop = {
  onDragEnter: refuseFileDrop,
  onDragOver: refuseFileDrop,
  onDrop: refuseFileDrop,
};
