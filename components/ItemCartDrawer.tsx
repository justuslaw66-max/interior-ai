"use client";


type CartItem = {
  id: string;
  productId: string;
  title: string;
  qty: number;
  thumbUrl?: string;
};

type Props = {
  items: CartItem[];
  onRemove: (productId: string) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onClear: () => void;
  onAddAllToRoom: () => void;
  isOpen: boolean;
  onToggle: () => void;
};

export default function ItemCartDrawer({
  items,
  onRemove,
  onUpdateQty,
  onClear,
  onAddAllToRoom,
  isOpen,
  onToggle,
}: Props) {
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <>
      {/* Drawer toggle button */}
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
        title="Open item cart"
      >
        <div className="flex flex-col items-center">
          <span className="text-lg">🛒</span>
          {totalItems > 0 && (
            <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {totalItems}
            </span>
          )}
        </div>
      </button>

      {/* Drawer overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {/* Drawer content */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-96 bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Items to Add</h2>
              <button
                onClick={onToggle}
                className="text-2xl font-bold text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              {totalItems} item{totalItems !== 1 ? "s" : ""} selected
            </p>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-neutral-400">
                <div>
                  <p className="text-xl">No items yet</p>
                  <p className="mt-1 text-sm">Use the quick-add buttons to get started</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-neutral-200 p-3">
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
                          onClick={() =>
                            onUpdateQty(item.productId, Math.max(0, item.qty - 1))
                          }
                          className="h-6 w-6 rounded border border-neutral-300 text-center text-sm leading-4"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-medium">
                          {item.qty}
                        </span>
                        <button
                          onClick={() => onUpdateQty(item.productId, item.qty + 1)}
                          className="h-6 w-6 rounded border border-neutral-300 text-center text-sm leading-4"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => onRemove(item.productId)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {items.length > 0 && (
            <div className="border-t border-neutral-200 p-4 space-y-2">
              <button
                onClick={onAddAllToRoom}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-white font-medium hover:bg-green-700 transition-colors"
              >
                ✓ Add All to Room
              </button>
              <button
                onClick={onClear}
                className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
