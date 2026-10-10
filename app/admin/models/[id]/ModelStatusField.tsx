import type { ModelAssetStatus } from "@/lib/modelAssetStatus";
import { describeAdminStatus } from "../../admin-status";

const MODEL_STATUSES: readonly ModelAssetStatus[] = ["draft", "needs_fix", "approved"];

/** A model's status, by the same labels as its badge (UX audit AD5). */
export function ModelStatusField({
  value,
  onChange,
}: {
  value: ModelAssetStatus;
  onChange: (status: ModelAssetStatus) => void;
}) {
  return (
    <label className="block text-xs">
      <div className="mb-1 font-medium">Status</div>
      <select
        className="w-full rounded-md border px-2 py-1"
        value={value}
        onChange={(event) => onChange(event.target.value as ModelAssetStatus)}
      >
        {MODEL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {describeAdminStatus("modelAsset", status).label}
          </option>
        ))}
      </select>
    </label>
  );
}
