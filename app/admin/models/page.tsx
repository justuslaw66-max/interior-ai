import type { Metadata } from "next";
import Link from "next/link";
import { isAdminEmail } from "@/lib/admin";
import { getModelAssetStatus } from "@/lib/modelAssetStatus";
import { AdminPageHeader } from "../AdminPageHeader";
import { AdminPager } from "../AdminPager";
import { AdminStatusBadge } from "../AdminStatusBadge";
import { adminSection, adminTitle } from "../admin-navigation";
import { adminPageHrefs, type AdminSearchParams } from "../admin-paging";
import { auth } from "../admin-session";
import { loadModelList } from "./load-models";
import {
  MODEL_APPROVAL_FILTERS,
  modelListParams,
  parseModelListFilters,
  type ModelListFilters,
} from "./models-list";

const SECTION = adminSection("/admin/models");

export const metadata: Metadata = { title: adminTitle(SECTION.title) };

const FIELD = "mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm";

function ModelFilters({ filters }: { filters: ModelListFilters }) {
  return (
    <form className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[180px_1fr_auto_auto]" method="get">
      <label className="text-xs font-medium text-neutral-700">
        Status
        <select className={FIELD} defaultValue={filters.approval ?? ""} name="approval">
          <option value="">All models</option>
          {Object.entries(MODEL_APPROVAL_FILTERS).map(([approval, label]) => (
            <option key={approval} value={approval}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-neutral-700 md:col-span-2">
        Search model ID or file
        <input className={FIELD} defaultValue={filters.query} maxLength={120} name="q" />
      </label>
      <button className="h-10 self-end rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white">
        Apply filters
      </button>
    </form>
  );
}

export default async function ModelsPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) return null;

  const params = await searchParams;
  const filters = parseModelListFilters(params);
  const list = await loadModelList(filters, params);
  const pages = adminPageHrefs(SECTION.href, modelListParams(filters), list.page);

  return (
    <div className="space-y-4 p-6">
      <AdminPageHeader
        crumbs={[{ title: SECTION.title }]}
        title={SECTION.title}
        description="Every 3D model, newest change first. Open one to check it and approve it."
      />
      <ModelFilters filters={filters} />
      <p className="text-sm text-neutral-600">
        {list.matching} {list.matching === 1 ? "model matches" : "models match"}
      </p>
      <div className="grid grid-cols-4 gap-4">
        {list.page.rows.map((a) => (
          <Link key={a.id} href={`/admin/models/${a.id}`} className="rounded-xl border p-3 hover:bg-muted">
            <div className="text-sm font-medium">{a.id}</div>
            <div className="text-xs opacity-70">{a.modelUrl}</div>
            <div className="mt-2 text-xs">
              {a.dimsWmm}×{a.dimsDmm}×{a.dimsHmm} mm
            </div>
            <div className="mt-2">
              <AdminStatusBadge kind="modelAsset" status={getModelAssetStatus(a)} />
            </div>
          </Link>
        ))}
      </div>
      <AdminPager {...pages} cursorLost={list.cursorLost} />
    </div>
  );
}
