type Props = {
  label: string;
};

function getBadgeClass(label: string) {
  if (/recommended/i.test(label)) {
    return "border-success-tint-border bg-success-tint text-on-success-tint";
  }
  if (/fits/i.test(label)) {
    return "border-accent-tint-border bg-accent-tint text-on-accent-tint";
  }
  if (/too large/i.test(label)) {
    return "border-danger-tint-border bg-danger-tint text-on-danger-tint";
  }
  if (/check/i.test(label)) {
    return "border-warning-tint-border bg-warning-tint text-on-warning-tint";
  }
  return "border-box-border bg-tile text-label-secondary";
}

export default function CatalogRoomFitBadge({ label }: Props) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getBadgeClass(label)}`}>
      {label}
    </span>
  );
}
