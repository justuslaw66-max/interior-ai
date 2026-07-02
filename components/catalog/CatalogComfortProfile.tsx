import type { CatalogComfortAxisView } from "@/lib/catalog/view-builders";

type Props = {
  axes: CatalogComfortAxisView[];
};

export default function CatalogComfortProfile({ axes }: Props) {
  if (!axes.length) return null;

  return (
    <section className="border-t border-neutral-100 pt-3" data-testid="catalog-comfort-profile">
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Seat feel</h4>
      <div className="mt-2 space-y-2">
        {axes.map((axis) => (
          <div key={axis.id} data-testid={`catalog-comfort-axis-${axis.id}`}>
            <div className="mb-1 text-xs font-medium text-neutral-800">{axis.label}</div>
            <div className="grid grid-cols-[56px_1fr_50px] items-center gap-2 text-[11px] text-neutral-500">
              <span>{axis.minLabel}</span>
              <div className="grid grid-cols-5 gap-1" aria-label={`${axis.label}: ${axis.value} of 5`}>
                {[1, 2, 3, 4, 5].map((step) => (
                  <span
                    key={step}
                    className={[
                      "h-2 rounded-sm",
                      step === axis.value ? "bg-[#8d4328]" : "bg-[#dcc9c0]",
                    ].join(" ")}
                    aria-hidden
                  />
                ))}
              </div>
              <span className="text-right">{axis.maxLabel}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
