"use client";

import {
  useCallback,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";

export function canCabinetModuleDragOver(
  draggedModuleId: string | null,
  targetModuleId: string
): boolean {
  return Boolean(draggedModuleId && draggedModuleId !== targetModuleId);
}

export function resolveCabinetModuleDropSource(
  draggedModuleId: string | null,
  transferredModuleId: string
): string {
  return draggedModuleId || transferredModuleId;
}

export interface CabinetModuleReorderDragController {
  draggedModuleId: string | null;
  onModuleDragStart: (
    moduleId: string,
    event: ReactDragEvent<HTMLButtonElement>
  ) => void;
  onModuleDragEnd: () => void;
  onModuleDragOver: (
    targetModuleId: string,
    event: ReactDragEvent<HTMLButtonElement>
  ) => void;
  onModuleDrop: (
    targetModuleId: string,
    event: ReactDragEvent<HTMLButtonElement>
  ) => void;
}

export function useCabinetModuleReorderDrag(
  onReorder: (sourceModuleId: string, targetModuleId: string) => void
): CabinetModuleReorderDragController {
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);

  const onModuleDragStart = useCallback(
    (moduleId: string, event: ReactDragEvent<HTMLButtonElement>) => {
      setDraggedModuleId(moduleId);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", moduleId);
    },
    []
  );

  const onModuleDragEnd = useCallback(() => {
    setDraggedModuleId(null);
  }, []);

  const onModuleDragOver = useCallback(
    (targetModuleId: string, event: ReactDragEvent<HTMLButtonElement>) => {
      if (!canCabinetModuleDragOver(draggedModuleId, targetModuleId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [draggedModuleId]
  );

  const onModuleDrop = useCallback(
    (targetModuleId: string, event: ReactDragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const sourceModuleId = resolveCabinetModuleDropSource(
        draggedModuleId,
        event.dataTransfer.getData("text/plain")
      );
      setDraggedModuleId(null);
      if (sourceModuleId) onReorder(sourceModuleId, targetModuleId);
    },
    [draggedModuleId, onReorder]
  );

  return {
    draggedModuleId,
    onModuleDragStart,
    onModuleDragEnd,
    onModuleDragOver,
    onModuleDrop,
  };
}
