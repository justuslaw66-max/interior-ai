type Props = {
  hints: string[];
};

export default function CatalogPlacementHint({ hints }: Props) {
  if (!hints.length) return null;

  return (
    <div className="rounded-lg border border-accent-tint-border bg-accent-tint p-2 text-xs text-on-accent-tint">
      {hints.map((hint) => (
        <div key={hint}>- {hint}</div>
      ))}
    </div>
  );
}
