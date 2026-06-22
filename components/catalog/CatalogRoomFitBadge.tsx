type Props = {
  label: string;
};

function getBadgeClass(label: string) {
  if (/recommended/i.test(label)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (/fits/i.test(label)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (/too large/i.test(label)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (/check/i.test(label)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

export default function CatalogRoomFitBadge({ label }: Props) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${getBadgeClass(label)}`}>
      {label}
    </span>
  );
}
