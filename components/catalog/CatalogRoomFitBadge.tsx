type Props = {
  label: string;
};

export default function CatalogRoomFitBadge({ label }: Props) {
  return (
    <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      {label}
    </span>
  );
}
