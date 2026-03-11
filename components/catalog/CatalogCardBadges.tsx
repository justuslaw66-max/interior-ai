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
          className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium text-neutral-700"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}
