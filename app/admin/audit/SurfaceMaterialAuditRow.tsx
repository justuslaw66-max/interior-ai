import { getRelativeSurfaceMaterialPath, type SurfaceMaterialAdminAuditSummary } from "@/lib/surface-material-audit";
import { describeNoOwnPicture, type NoOwnPicture } from "@/lib/surface-material-picture-source";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { formatAuditValue } from "./surface-material-audit-view";

type Material = SurfaceMaterialAdminAuditSummary;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-neutral-50 p-2">
      <div className="text-neutral-500">{label}</div>
      <div className="mt-0.5 font-medium text-neutral-900">{value}</div>
    </div>
  );
}

function SurfaceMaterialFacts({ material }: { material: Material }) {
  const hasSwatch = !material.missingAssets.includes("swatch_url");
  const hasBaseColor = !material.missingAssets.includes("base_color_url");
  return (
    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
      <Fact label="Supplier" value={material.brand ?? formatAuditValue(material.supplier)} />
      <Fact label="Material family" value={formatAuditValue(material.materialFamily)} />
      <Fact label="License status" value={formatAuditValue(material.licenseStatus)} />
      <Fact label="Sample available" value={String(material.sampleAvailable)} />
      <Fact
        label="Swatch / base texture"
        value={`${hasSwatch ? "Swatch ok" : "Swatch missing"} / ${hasBaseColor ? "Base ok" : "Base missing"}`}
      />
      <Fact label="Blocker count" value={String(material.blockers.length)} />
    </div>
  );
}

function MissingList({ title, items }: { title: string; items: string[] }) {
  const missing = items.length > 0;
  return (
    <div
      className={
        missing
          ? "rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800"
          : "rounded-md border border-green-200 bg-green-50 p-2 text-green-800"
      }
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{missing ? items.map(formatAuditValue).join(", ") : "None"}</div>
    </div>
  );
}

function LinkFact({ title, url }: { title: string; url: string | null }) {
  return (
    <div className="rounded-md border p-2">
      <div className="font-semibold text-neutral-700">{title}</div>
      {url ? (
        <a className="mt-1 block break-all text-blue-700" href={url} target="_blank" rel="noreferrer">
          {url}
        </a>
      ) : (
        <div className="mt-1 text-red-700">Missing</div>
      )}
    </div>
  );
}

function AuditDetail({ material }: { material: Material }) {
  if (material.failures.length === 0 && material.warnings.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border p-2 text-xs">
      <div className="font-semibold text-neutral-700">Audit detail</div>
      {material.failures.map((entry) => (
        <div key={`fail-${entry}`} className="mt-1 text-red-700">
          FAIL: {entry}
        </div>
      ))}
      {material.warnings.map((entry) => (
        <div key={`warn-${entry}`} className="mt-1 text-amber-700">
          WARN: {entry}
        </div>
      ))}
    </div>
  );
}

export function SurfaceMaterialAuditRow({
  material,
  noOwnPicture = null,
}: {
  material: Material;
  noOwnPicture?: NoOwnPicture | null;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{material.productName || material.materialId}</div>
          <div className="mt-1 font-mono text-xs text-neutral-700">{material.materialId}</div>
          <div className="mt-1 text-xs text-neutral-500">{getRelativeSurfaceMaterialPath(material.filePath)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {noOwnPicture ? <AdminStatusBadge kind="surfacePicture" status={noOwnPicture.source} /> : null}
          <AdminStatusBadge kind="surfacePublication" status={material.publishStatus} />
        </div>
      </div>
      {noOwnPicture ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {describeNoOwnPicture(noOwnPicture)}
        </div>
      ) : null}

      <SurfaceMaterialFacts material={material} />

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <MissingList title="Missing assets" items={material.missingAssets} />
        <MissingList title="Missing specs" items={material.missingSpecs} />
      </div>

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <LinkFact title="Source URL" url={material.sourceUrl} />
        <LinkFact title="Sample / quote URL" url={material.sampleRequestUrl} />
      </div>

      <div className="mt-3 rounded-md border p-2 text-xs">
        <div className="font-semibold text-neutral-700">Publish blockers</div>
        <div className={material.blockers.length > 0 ? "mt-1 text-amber-700" : "mt-1 text-green-700"}>
          {material.blockers.length > 0 ? material.blockers.map(formatAuditValue).join("; ") : "None"}
        </div>
      </div>

      <AuditDetail material={material} />
    </div>
  );
}
