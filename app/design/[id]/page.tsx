import { redirect } from "next/navigation";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";

type LegacyDesignSearchParams = {
  mode?: string | string[];
  view?: string | string[];
  workspace?: string | string[];
  floorPlanImport?: string | string[];
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<LegacyDesignSearchParams>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const mode = singleValue(resolvedSearchParams.mode);
  const view = singleValue(resolvedSearchParams.view);
  const workspace = singleValue(resolvedSearchParams.workspace);

  redirect(buildDesignEditorUrl({
    designId: id,
    mode: mode === "designer" ? mode : undefined,
    view: view === "2d" ? view : undefined,
    workspace: workspace === "furnish" ? workspace : undefined,
    floorPlanImportId: singleValue(resolvedSearchParams.floorPlanImport),
  }));
}
