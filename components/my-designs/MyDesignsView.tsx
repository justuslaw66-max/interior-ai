"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DesignRenameDialog } from "@/components/editor/design-page/DesignRenameDialog";
import { MyDesignCardView } from "@/components/my-designs/MyDesignCardView";
import { ShareDesignDialog } from "@/components/my-designs/ShareDesignDialog";
import {
  confirmDelete,
  copyShareLink,
  MY_DESIGNS_NEW_DESIGN_ID,
  saveRename,
  useMyDesignsPageState,
  type MyDesignsPageState,
} from "@/components/my-designs/useMyDesignsPageState";
import { designLimitSummary } from "@/lib/design-limits";
import type { MyDesignCard } from "@/lib/my-designs";
import { useClientHydrated } from "@/lib/useClientHydrated";
import { NEW_DESIGN_HREF, PRICING_HREF } from "@/lib/start-design-link";

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

const NO_RETURN_FOCUS: readonly string[] = [];

export type MyDesignsViewProps = {
  designs: MyDesignCard[];
  /** How many designs the plan keeps; null for Pro, which has no limit to show. */
  limit: number | null;
};

/** My designs, as in the mockup (audit findings MD1, MD3 and MD6). */
export function MyDesignsView({ designs, limit: planLimit }: MyDesignsViewProps) {
  const state = useMyDesignsPageState(designs);
  const limit = designLimitSummary(state.visibleDesigns.length, planLimit);
  const hydrated = useClientHydrated();
  return (
    <main data-testid="my-designs-page" data-client-hydrated={hydrated ? "true" : "false"}
      className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">My designs</h1>
          {limit ? (
            <p data-testid="my-designs-limit" className="text-[15px] text-neutral-600">
              {limit.text} {limit.reached ? "Delete a design or upgrade to save more. " : ""}
              <Link href={PRICING_HREF} data-testid="my-designs-see-pricing"
                className={`whitespace-nowrap rounded font-bold text-blue-800 hover:underline ${FOCUS_RING}`}>See pricing</Link>
            </p>
          ) : null}
        </div>
        <Link href={NEW_DESIGN_HREF} id={MY_DESIGNS_NEW_DESIGN_ID} data-testid="my-designs-new-design"
          className={`flex h-11 items-center gap-2 rounded-[10px] bg-neutral-900 pl-4 pr-5 text-[15px] font-bold text-white hover:bg-neutral-800 ${FOCUS_RING}`}>
          <Plus aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
          New design
        </Link>
      </div>
      <p role="status" aria-live="polite" data-testid="my-designs-status" className="mt-3 min-h-5 text-sm text-neutral-700">
        {state.status}
      </p>
      {state.error ? (
        <p role="alert" data-testid="my-designs-error" className="mt-1 text-sm font-bold text-red-800">{state.error}</p>
      ) : null}
      {state.visibleDesigns.length > 0 ? <MyDesignsGrid designs={state.visibleDesigns} state={state} /> : <MyDesignsEmpty />}
      <MyDesignsDialogs state={state} />
    </main>
  );
}

function MyDesignsGrid({ designs, state }: { designs: MyDesignCard[]; state: MyDesignsPageState }) {
  return (
    <ul aria-label="Saved designs" data-testid="my-designs-grid"
      className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {designs.map((card) => (
        <MyDesignCardView key={card.id} card={card} busy={state.copyingId === card.id}
          menuOpen={state.openMenuId === card.id}
          onToggleMenu={() => state.setOpenMenuId(state.openMenuId === card.id ? null : card.id)}
          onCloseMenu={() => state.setOpenMenuId(null)}
          onAction={(action) => state.onAction(card, action)} />
      ))}
    </ul>
  );
}

function MyDesignsEmpty() {
  return (
    <div data-testid="my-designs-empty"
      className="mt-6 flex flex-col items-start gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-8">
      <h2 className="text-lg font-bold">No saved designs yet</h2>
      <p className="max-w-prose text-[15px] text-neutral-600">
        Choose a template, draw your room or upload your floor plan. Designs you save show up here.
      </p>
    </div>
  );
}

function MyDesignsDialogs({ state }: { state: MyDesignsPageState }) {
  const { dialog } = state;
  const returnFocusIds = dialog?.returnFocusIds ?? NO_RETURN_FOCUS;
  return (
    <>
      <DesignRenameDialog open={dialog?.kind === "rename"} dark={false} busy={dialog?.kind === "rename" && dialog.busy}
        value={dialog?.kind === "rename" ? dialog.value : ""} returnFocusIds={returnFocusIds} manageBackground
        onValueChange={(value) => state.setDialog((current) => (current?.kind === "rename" ? { ...current, value } : current))}
        onCancel={() => state.setDialog(null)} onSave={() => void saveRename(state)} />
      <ConfirmDialog open={dialog?.kind === "delete"} title={`Delete ${dialog?.card.title ?? "this design"}?`}
        description="It's removed from My designs for good, and its shared link stops working."
        confirmLabel="Delete" destructive busy={dialog?.kind === "delete" && dialog.busy} returnFocusIds={returnFocusIds} manageBackground
        onCancel={() => state.setDialog(null)} onConfirm={() => void confirmDelete(state)} />
      <ShareDesignDialog open={dialog?.kind === "share"} designTitle={dialog?.card.title ?? ""}
        url={dialog?.kind === "share" ? dialog.url : null} errorMessage={dialog?.kind === "share" ? dialog.error : null}
        copied={dialog?.kind === "share" && dialog.copied} returnFocusIds={returnFocusIds}
        onCopy={() => copyShareLink(state)} onClose={() => state.setDialog(null)} />
    </>
  );
}
