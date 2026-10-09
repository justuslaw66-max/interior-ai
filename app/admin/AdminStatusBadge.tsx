import { describeAdminStatus, type AdminStatusKind, type AdminStatusTone } from "./admin-status";

const TONE_CLASS: Record<AdminStatusTone, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-red-200 bg-red-50 text-red-700",
};

/** A status in Admin, by its label from the one dictionary for its kind (UX audit AD5). */
export function AdminStatusBadge({ kind, status }: { kind: AdminStatusKind; status: string }) {
  const { label, tone } = describeAdminStatus(kind, status);
  return (
    <span
      data-status={status}
      data-tone={tone}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
