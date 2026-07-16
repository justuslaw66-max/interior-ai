"use client";

import type { PendingCatalogPlacementScene } from "@/lib/catalog-placement";
import type { ManualPlacementScore } from "@/lib/manual-placement-scoring";

type PlacementQuality = {
  label: string;
  tone: "good" | "warn" | "bad";
};

type PlacementImprovement = {
  score: number;
  scoreDelta: number;
};

type BestRoomPlacement = PlacementImprovement & {
  roomName: string;
};

type BestVariantPlacement = PlacementImprovement & {
  variantLabel: string;
};

export type CatalogPlacementConfirmPanelState = {
  scene: PendingCatalogPlacementScene | null;
  roomName: string | null;
  hardInvalid: boolean;
  statusLabel: string;
  targetLabel: string | null;
  targetValid: boolean;
  quality: PlacementQuality | null;
  score: ManualPlacementScore | null;
  improvement: PlacementImprovement | null;
  bestRoomPlacement: BestRoomPlacement | null;
  bestVariantPlacement: BestVariantPlacement | null;
  blocked: boolean;
  hasRestorablePlacement: boolean;
  shouldConfirmImprovedPlacement: boolean;
  shouldConfirmRestoredPlacement: boolean;
};

export type CatalogPlacementConfirmPanelConfiguration = {
  activeRoomName: string | null;
  nudgeStepMeters: number;
};

export type CatalogPlacementConfirmPanelActions = {
  onAutoPlace: () => void;
  onMoveToBestRoom: () => void;
  onSwitchToBestOption: () => void;
  onImprovePlacement: () => void;
  onRestoreValidPlacement: () => void;
  onSelectBlocker: () => void;
  onSwapWithBlocker: () => void;
  onMoveBlockerAside: () => void;
  onPlaceBesideBlocker: () => void;
  onTrySmallerVariant: () => void;
  onCenter: () => void;
  onNudge: (deltaX: number, deltaZ: number) => void;
  onRotate: (direction: "left" | "right") => void;
  onCancel: () => void;
  onConfirm: () => void;
};

type CatalogPlacementConfirmPanelProps = {
  state: CatalogPlacementConfirmPanelState;
  configuration: CatalogPlacementConfirmPanelConfiguration;
  actions: CatalogPlacementConfirmPanelActions;
};

export function CatalogPlacementConfirmPanel({
  state,
  configuration,
  actions,
}: CatalogPlacementConfirmPanelProps) {
  const {
    scene: pendingCatalogPlacementScene,
    roomName: pendingCatalogPlacementRoomName,
    hardInvalid: pendingCatalogPlacementHardInvalid,
    statusLabel: pendingCatalogPlacementStatusLabel,
    targetLabel: activePlacementTargetLabel,
    targetValid: activePlacementTargetValid,
    quality: pendingCatalogPlacementQuality,
    score: pendingCatalogPlacementScore,
    improvement: pendingCatalogPlacementImprovement,
    bestRoomPlacement: pendingCatalogBestRoomPlacement,
    bestVariantPlacement: pendingCatalogBestVariantPlacement,
    blocked: pendingCatalogPlacementBlocked,
    hasRestorablePlacement,
    shouldConfirmImprovedPlacement: shouldConfirmImprovedCatalogPlacement,
    shouldConfirmRestoredPlacement: shouldConfirmRestoredCatalogPlacement,
  } = state;
  const { activeRoomName, nudgeStepMeters } = configuration;

  if (!pendingCatalogPlacementScene) return null;

  return (
    <div
      data-testid="catalog-placement-confirm-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Preview catalog placement"
      className={`fixed inset-x-0 bottom-0 z-[95] max-h-[82vh] overflow-y-auto rounded-t-2xl border bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:bottom-5 md:right-5 md:max-h-[min(48vh,420px)] md:w-[min(460px,calc(100vw-2rem))] md:rounded-xl md:p-3 md:pb-3 ${
        pendingCatalogPlacementHardInvalid ? "border-red-200" : "border-emerald-200"
      }`}
    >
      <div
        className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-neutral-200 md:hidden"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Preview placement
          </p>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-neutral-950 md:line-clamp-1 md:text-sm">
            {pendingCatalogPlacementScene.productTitle}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-neutral-600 md:line-clamp-1 md:text-xs">
            {pendingCatalogPlacementScene.variantLabel} · {pendingCatalogPlacementScene.reason}
            {pendingCatalogPlacementRoomName ? ` · ${pendingCatalogPlacementRoomName}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              data-testid="catalog-placement-status"
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                pendingCatalogPlacementHardInvalid
                  ? "bg-red-50 text-red-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {pendingCatalogPlacementStatusLabel}
            </span>
            <span className="text-xs text-neutral-500 md:hidden">
              Drag the preview or tap a room/highlighted zone, then confirm.
            </span>
            {activePlacementTargetLabel && (
              <span
                data-testid="catalog-placement-target-room"
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  activePlacementTargetValid
                    ? "bg-blue-50 text-blue-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                Target: {activePlacementTargetLabel}
              </span>
            )}
            {pendingCatalogPlacementQuality && (
              <span
                data-testid="catalog-placement-quality"
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  pendingCatalogPlacementQuality.tone === "good"
                    ? "bg-blue-50 text-blue-700"
                    : pendingCatalogPlacementQuality.tone === "warn"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                }`}
              >
                {pendingCatalogPlacementQuality.label}
              </span>
            )}
          </div>
          {pendingCatalogPlacementScore && (
            <div
              data-testid="catalog-placement-score-card"
              className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 md:p-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Placement score
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-neutral-950">
                    {pendingCatalogPlacementScore.label} · {pendingCatalogPlacementScore.score}/100
                  </div>
                </div>
                <div
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    pendingCatalogPlacementScore.relationship === "good"
                      ? "bg-emerald-100 text-emerald-800"
                      : pendingCatalogPlacementScore.relationship === "wrong"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-white text-neutral-700"
                  }`}
                >
                  {pendingCatalogPlacementScore.relationship === "good"
                    ? "Good relationship"
                    : pendingCatalogPlacementScore.relationship === "wrong"
                      ? "Check relationship"
                      : pendingCatalogPlacementScore.relationship === "missing"
                        ? "Needs anchor"
                        : "Neutral"}
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-600">
                {pendingCatalogPlacementScore.summary}
              </div>
              {pendingCatalogPlacementScore.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-800 md:mt-1">
                  {pendingCatalogPlacementScore.warnings.slice(0, 3).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {pendingCatalogPlacementScore.suggestions.length > 0 && (
                <div className="mt-2 text-xs text-neutral-600 md:hidden">
                  {pendingCatalogPlacementScore.suggestions[0]}
                </div>
              )}
              {pendingCatalogPlacementImprovement && (
                <div
                  data-testid="catalog-placement-improvement-hint"
                  className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
                >
                  Better nearby spot available: +{pendingCatalogPlacementImprovement.scoreDelta} to{" "}
                  {pendingCatalogPlacementImprovement.score}/100.
                </div>
              )}
              {pendingCatalogBestRoomPlacement && (
                <div
                  data-testid="catalog-placement-best-room-hint"
                  className="mt-2 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800"
                >
                  Best room: {pendingCatalogBestRoomPlacement.roomName} · +
                  {pendingCatalogBestRoomPlacement.scoreDelta} to{" "}
                  {pendingCatalogBestRoomPlacement.score}/100.
                </div>
              )}
              {pendingCatalogBestVariantPlacement && (
                <div
                  data-testid="catalog-placement-best-option-hint"
                  className="mt-2 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800"
                >
                  Best option: {pendingCatalogBestVariantPlacement.variantLabel} · +
                  {pendingCatalogBestVariantPlacement.scoreDelta} to{" "}
                  {pendingCatalogBestVariantPlacement.score}/100.
                </div>
              )}
              {pendingCatalogPlacementScore.compatibleZoneIds.length > 0 && (
                <div className="mt-2 text-xs font-semibold text-emerald-700 md:hidden">
                  Compatible zones are highlighted on the canvas.
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-2">
            <button
              type="button"
              data-testid="catalog-placement-auto-place"
              className="min-h-11 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
              onClick={actions.onAutoPlace}
            >
              Find open spot
            </button>
            {pendingCatalogBestRoomPlacement ? (
              <button
                type="button"
                data-testid="catalog-placement-best-room"
                className="min-h-11 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onMoveToBestRoom}
              >
                Best room
              </button>
            ) : null}
            {pendingCatalogBestVariantPlacement ? (
              <button
                type="button"
                data-testid="catalog-placement-best-option"
                className="min-h-11 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onSwitchToBestOption}
              >
                Best option
              </button>
            ) : null}
            {pendingCatalogPlacementImprovement ? (
              <button
                type="button"
                data-testid="catalog-placement-improve"
                className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onImprovePlacement}
              >
                Improve placement
              </button>
            ) : null}
            {pendingCatalogPlacementBlocked && hasRestorablePlacement ? (
              <button
                type="button"
                data-testid="catalog-placement-restore-valid"
                className="min-h-11 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onRestoreValidPlacement}
              >
                Back to valid spot
              </button>
            ) : null}
            {pendingCatalogPlacementBlocked ? (
              <button
                type="button"
                data-testid="catalog-placement-select-blocker"
                className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onSelectBlocker}
              >
                Select blocker
              </button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("swap_with_blocker") ? (
              <button
                type="button"
                data-testid="catalog-placement-swap-blocker"
                className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onSwapWithBlocker}
              >
                Swap with blocker
              </button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("move_blocker_aside") ? (
              <button
                type="button"
                data-testid="catalog-placement-move-blocker"
                className="min-h-11 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onMoveBlockerAside}
              >
                Move blocker aside
              </button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("place_beside_blocker") ? (
              <button
                type="button"
                data-testid="catalog-placement-beside-blocker"
                className="min-h-11 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onPlaceBesideBlocker}
              >
                Place beside blocker
              </button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("try_smaller_variant") ? (
              <button
                type="button"
                data-testid="catalog-placement-smaller-variant"
                className="min-h-11 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
                onClick={actions.onTrySmallerVariant}
              >
                Try smaller variant
              </button>
            ) : null}
            <button
              type="button"
              data-testid="catalog-placement-center"
              className="min-h-11 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:px-3 md:py-1.5 md:text-xs"
              onClick={actions.onCenter}
            >
              Center
            </button>
            <button
              type="button"
              data-testid="catalog-placement-nudge-left"
              className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
              aria-label="Nudge placement left"
              onClick={() => actions.onNudge(-nudgeStepMeters, 0)}
            >
              ←
            </button>
            <button
              type="button"
              data-testid="catalog-placement-nudge-up"
              className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
              aria-label="Nudge placement back"
              onClick={() => actions.onNudge(0, -nudgeStepMeters)}
            >
              ↑
            </button>
            <button
              type="button"
              data-testid="catalog-placement-nudge-down"
              className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
              aria-label="Nudge placement front"
              onClick={() => actions.onNudge(0, nudgeStepMeters)}
            >
              ↓
            </button>
            <button
              type="button"
              data-testid="catalog-placement-nudge-right"
              className="h-11 w-11 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:h-8 md:w-8 md:text-xs"
              aria-label="Nudge placement right"
              onClick={() => actions.onNudge(nudgeStepMeters, 0)}
            >
              →
            </button>
          </div>
        </div>
        <div className="sticky bottom-0 -mx-4 grid shrink-0 grid-cols-2 gap-2 border-t border-neutral-200 bg-white/95 px-4 pb-1 pt-3 backdrop-blur md:-mx-3 md:px-3 md:pb-0 md:pt-2">
          <button
            type="button"
            data-testid="catalog-placement-rotate-left"
            className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:text-xs"
            onClick={() => actions.onRotate("left")}
          >
            Rotate left
          </button>
          <button
            type="button"
            data-testid="catalog-placement-rotate-right"
            className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:text-xs"
            onClick={() => actions.onRotate("right")}
          >
            Rotate right
          </button>
          <button
            type="button"
            data-testid="catalog-placement-cancel"
            className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 md:min-h-9 md:text-xs"
            onClick={actions.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="catalog-placement-confirm"
            disabled={
              pendingCatalogPlacementHardInvalid &&
              !shouldConfirmImprovedCatalogPlacement &&
              !shouldConfirmRestoredCatalogPlacement
            }
            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-white md:min-h-9 md:text-xs ${
              pendingCatalogPlacementHardInvalid &&
              !shouldConfirmImprovedCatalogPlacement &&
              !shouldConfirmRestoredCatalogPlacement
                ? "cursor-not-allowed bg-neutral-300"
                : "bg-neutral-950 hover:bg-neutral-800"
            }`}
            onClick={actions.onConfirm}
          >
            {shouldConfirmImprovedCatalogPlacement
              ? "Add best spot to"
              : shouldConfirmRestoredCatalogPlacement
                ? "Add valid spot to"
                : "Add to"}{" "}
            {pendingCatalogPlacementRoomName ?? activeRoomName ?? "room"}
          </button>
        </div>
      </div>
    </div>
  );
}
