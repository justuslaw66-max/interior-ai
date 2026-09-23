"use client";

import { useId, useRef } from "react";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";

export type ItemCartDrawerItem = {
  id: string;
  productId: string;
  title: string;
  qty: number;
  thumbUrl?: string;
};

export type ItemCartDrawerProps = {
  items: ItemCartDrawerItem[];
  onRemove: (productId: string) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onClear: () => void;
  onAddAllToRoom: () => void;
  isOpen: boolean;
  onToggle: () => void;
  triggerClassName?: string;
};

export function runCartMutationWithFocus(
  focusFallback: () => void,
  mutation: () => void,
) {
  focusFallback();
  mutation();
}

function ItemCartFooter({
  onAddAllToRoom,
  onClear,
  onBeforeMutation,
}: Pick<ItemCartDrawerProps, "onAddAllToRoom" | "onClear"> & {
  onBeforeMutation: () => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        data-testid="selection-tray-add-all"
        onClick={onAddAllToRoom}
        className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white transition-colors hover:bg-green-700"
      >
        Add All to Room
      </button>
      <button
        type="button"
        data-testid="selection-tray-clear"
        onClick={() => runCartMutationWithFocus(onBeforeMutation, onClear)}
        className="w-full rounded-lg border border-neutral-300 px-4 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        Clear
      </button>
    </div>
  );
}

function ItemCartRow({
  item,
  onRemove,
  onUpdateQty,
  onBeforeMutation,
}: Pick<ItemCartDrawerProps, "onRemove" | "onUpdateQty"> & {
  item: ItemCartDrawerItem;
  onBeforeMutation: () => void;
}) {
  const decrement = () => {
    const update = () => onUpdateQty(item.productId, Math.max(0, item.qty - 1));
    if (item.qty <= 1) runCartMutationWithFocus(onBeforeMutation, update);
    else update();
  };
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      {item.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbUrl}
          alt={item.title}
          className="mb-2 h-32 w-full rounded bg-neutral-100 object-contain p-1"
        />
      )}
      <p className="text-sm font-medium text-neutral-900">{item.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Decrease ${item.title} quantity`}
            onClick={decrement}
            className="h-6 w-6 rounded border border-neutral-300 text-center text-sm leading-4"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
          <button
            type="button"
            aria-label={`Increase ${item.title} quantity`}
            onClick={() => onUpdateQty(item.productId, item.qty + 1)}
            className="h-6 w-6 rounded border border-neutral-300 text-center text-sm leading-4"
          >
            +
          </button>
        </div>
        <button
          type="button"
          aria-label={`Remove ${item.title}`}
          onClick={() =>
            runCartMutationWithFocus(onBeforeMutation, () => onRemove(item.productId))
          }
          className="text-xs font-medium text-red-600 hover:text-red-700"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function ItemCartDrawer({
  items,
  onRemove,
  onUpdateQty,
  onClear,
  onAddAllToRoom,
  isOpen,
  onToggle,
  triggerClassName = "bottom-4 right-4",
}: ItemCartDrawerProps) {
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
  const triggerId = useId();
  const dialogId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusCloseButton = () =>
    closeButtonRef.current?.focus({ preventScroll: true });

  return (
    <>
      <button
        id={triggerId}
        data-testid="selection-tray-trigger"
        type="button"
        onClick={onToggle}
        className={`fixed z-40 flex h-12 min-w-12 items-center justify-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 ${triggerClassName}`}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Selection tray open" : "Open selection tray"}, ${totalItems} selected item${totalItems === 1 ? "" : "s"}`}
      >
        <div className="flex items-center">
          <span>Tray</span>
          {totalItems > 0 && (
            <span aria-hidden="true" className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {totalItems}
            </span>
          )}
        </div>
      </button>

      <EditorDialog
        open={isOpen}
        title="Selection Tray"
        description={`${totalItems} item${totalItems === 1 ? "" : "s"} selected`}
        onClose={onToggle}
        closeLabel="Close selection tray"
        closeButtonTestId="selection-tray-close"
        closeButtonRef={closeButtonRef}
        dialogId={dialogId}
        returnFocusId={triggerId}
        cancelFocusRestorationOnUnmount waitForEntryTransition
        placement="right"
        forceLight
        testId="selection-tray-dialog"
        overlayClassName="!bg-black/30 backdrop-blur-sm"
        panelClassName="flex h-full max-w-96 flex-col rounded-none border-y-0 border-r-0 !p-0 shadow-xl duration-300 ease-in-out data-[editor-dialog-state=mounting]:translate-x-full sm:w-96"
        headerClassName="!items-center border-b border-neutral-200 p-4"
        contentClassName="!mt-0 min-h-0 flex-1 overflow-y-auto p-4"
        footerClassName="!mt-0 border-t border-neutral-200 p-4"
        footer={
          items.length > 0 ? (
            <ItemCartFooter
              onAddAllToRoom={onAddAllToRoom}
              onClear={onClear}
              onBeforeMutation={focusCloseButton}
            />
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-neutral-400">
            <div>
              <p className="text-xl">No items selected</p>
              <p className="mt-1 text-sm">
                Add products from the catalog or imported furniture panel.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ItemCartRow
                key={item.id}
                item={item}
                onRemove={onRemove}
                onUpdateQty={onUpdateQty}
                onBeforeMutation={focusCloseButton}
              />
            ))}
          </div>
        )}
      </EditorDialog>
    </>
  );
}
