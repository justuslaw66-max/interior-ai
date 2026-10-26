type Props = {
  badges: string[];
};

export default function CatalogCardBadges({ badges }: Props) {
  if (!badges.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {badges.slice(0, 2).map((badge) => (
        <span
          key={badge}
          className="inline-flex rounded-full border border-box-border bg-tile px-2 py-0.5 text-xs font-medium text-label-secondary"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}
