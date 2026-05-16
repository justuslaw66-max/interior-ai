type Swatch = { label: string; hex?: string };

type Props = {
  swatches: Swatch[];
};

export default function CatalogCardSwatches({ swatches }: Props) {
  if (!swatches.length) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {swatches.slice(0, 2).map((swatch, index) => (
        <span
          key={`${swatch.label}-${swatch.hex ?? "nohex"}-${index}`}
          title={swatch.label}
          className="h-4 w-4 rounded-full border border-neutral-300"
          style={{ backgroundColor: swatch.hex ?? "#e5e7eb" }}
        />
      ))}
    </div>
  );
}
