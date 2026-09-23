import type { Dispatch, SetStateAction } from "react";
import type { PublicDisplayMetadataDraft } from "./floorPlanReviewTypes";

export function PublicDisplayMetadataEditor(props: {
  disabled: boolean;
  value: PublicDisplayMetadataDraft;
  onChange: Dispatch<SetStateAction<PublicDisplayMetadataDraft>>;
}) {
  const field = (key: keyof PublicDisplayMetadataDraft, value: string) =>
    props.onChange((current) => ({ ...current, [key]: value }));

  return (
    <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
      <h3 className="text-sm font-semibold">Public library display</h3>
      <p className="mt-1 text-xs leading-5 text-neutral-600">
        These allowlisted fields are approved with the immutable revision. Upload
        filenames, source-manifest notes and reviewer comments are never used for
        browse cards.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium">
          Project name
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={160} onChange={(event) => field("projectName", event.target.value)} value={props.value.projectName} />
        </label>
        <label className="text-xs font-medium">
          Plan label
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={160} onChange={(event) => field("label", event.target.value)} placeholder="4-room Type A" value={props.value.label} />
        </label>
        <label className="text-xs font-medium">
          Flat type
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={80} onChange={(event) => field("flatType", event.target.value)} placeholder="4-room" value={props.value.flatType} />
        </label>
        <label className="text-xs font-medium">
          Floor area (sqm, optional)
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} max="5000" min="5" onChange={(event) => field("floorAreaSqm", event.target.value)} step="0.01" type="number" value={props.value.floorAreaSqm} />
        </label>
        <label className="text-xs font-medium md:col-span-2">
          Public preview URL
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={2048} onChange={(event) => field("previewUrl", event.target.value)} placeholder="/floor-plan-previews/revision-id.webp or public HTTPS URL" value={props.value.previewUrl} />
        </label>
        <label className="text-xs font-medium">
          Publisher
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={160} onChange={(event) => field("publisher", event.target.value)} placeholder="Housing and Development Board" value={props.value.publisher} />
        </label>
        <div />
        <label className="text-xs font-medium md:col-span-2">
          Public source URL (optional trio)
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={2048} onChange={(event) => field("sourceUrl", event.target.value)} placeholder="https://…" value={props.value.sourceUrl} />
        </label>
        <label className="text-xs font-medium">
          Source title
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} maxLength={200} onChange={(event) => field("sourceTitle", event.target.value)} value={props.value.sourceTitle} />
        </label>
        <label className="text-xs font-medium">
          Source PDF page
          <input className="mt-1 w-full rounded border bg-white p-2" disabled={props.disabled} max="10000" min="1" onChange={(event) => field("sourcePage", event.target.value)} type="number" value={props.value.sourcePage} />
        </label>
      </div>
    </section>
  );
}
