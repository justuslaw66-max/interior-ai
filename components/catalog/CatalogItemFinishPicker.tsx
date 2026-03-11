type FinishOption = {
  id: string;
  label: string;
  swatchHex?: string;
};

type Props = {
  finishOptions: FinishOption[];
  activeFinishId?: string;
  onSetFinish: (finishId: string) => void;
};

export default function CatalogItemFinishPicker({ finishOptions, activeFinishId, onSetFinish }: Props) {
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-800">Finish options</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {finishOptions.map((finish) => {
          const active = finish.id === activeFinishId;
          return (
            <button
              key={finish.id}
              onClick={() => onSetFinish(finish.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-700"
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-white/60"
                style={{ backgroundColor: finish.swatchHex ?? "#d1d5db" }}
              />
              {finish.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
