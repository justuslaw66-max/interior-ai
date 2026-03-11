type Props = {
  hints: string[];
};

export default function CatalogPlacementHint({ hints }: Props) {
  if (!hints.length) return null;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800">
      {hints.map((hint) => (
        <div key={hint}>- {hint}</div>
      ))}
    </div>
  );
}
