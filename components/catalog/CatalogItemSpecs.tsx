type Props = {
  dimsLabel: string;
  materialSummary: string[];
};

export default function CatalogItemSpecs({ dimsLabel, materialSummary }: Props) {
  return (
    <div className="rounded-lg border border-separator p-2 text-xs text-label-secondary">
      <div>Dimensions: {dimsLabel}</div>
      {materialSummary.length > 0 && (
        <div className="mt-1">Materials: {materialSummary.slice(0, 2).join(", ")}</div>
      )}
    </div>
  );
}
