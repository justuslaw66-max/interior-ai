"use client";

type Props = {
  onAddItem: (productId: string, categoryHint?: string) => void;
  categories: { label: string; icon: string; categoryKey: string }[];
};

export default function QuickAddPanel({ onAddItem, categories }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {categories.map((cat) => (
        <button
          key={cat.categoryKey}
          onClick={() => onAddItem("", cat.categoryKey)}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-700 transition-all hover:border-neutral-400 hover:bg-white active:scale-95"
        >
          <span className="text-lg">{cat.icon}</span>
          <span className="text-base">+ {cat.label}</span>
        </button>
      ))}
    </div>
  );
}
