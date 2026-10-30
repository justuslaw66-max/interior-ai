"use client";

import type { PendingCatalogPlacementScene } from "@/lib/catalog-placement";
import type { ManualPlacementScore } from "@/lib/manual-placement-scoring";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/Button";

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

export type CatalogPlacementConfirmPanelProps = {
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
      data-testid="catalog-placement-confirm-panel" data-surface="floating"
      role="dialog"
      aria-modal="false"
      aria-label="Preview catalogue placement"
      className={`fixed inset-x-0 bottom-0 z-[95] max-h-[82vh] overflow-y-auto rounded-t-2xl border bg-surface-floating p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:bottom-5 md:right-5 md:max-h-[min(48vh,420px)] md:w-[min(460px,calc(100vw-2rem))] md:rounded-xl md:p-3 md:pb-3 ring-1 ring-surface-floating-edge ${
        pendingCatalogPlacementHardInvalid ? "border-danger-tint-border" : "border-success-tint-border"
      }`}
    >
      <div
        className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-control-badge md:hidden"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-label-secondary">
            Preview placement
          </p>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-label md:line-clamp-1 md:text-sm">
            {pendingCatalogPlacementScene.productTitle}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-label-secondary md:line-clamp-1 md:text-xs">
            {pendingCatalogPlacementScene.variantLabel} · {pendingCatalogPlacementScene.reason}
            {pendingCatalogPlacementRoomName ? ` · ${pendingCatalogPlacementRoomName}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              data-testid="catalog-placement-status"
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                pendingCatalogPlacementHardInvalid
                  ? "bg-danger-tint text-on-danger-tint"
                  : "bg-success-tint text-on-success-tint"
              }`}
            >
              {pendingCatalogPlacementStatusLabel}
            </span>
            <span className="text-xs text-label-secondary md:hidden">
              Drag the preview or tap a room/highlighted zone, then confirm.
            </span>
            {activePlacementTargetLabel && (
              <span
                data-testid="catalog-placement-target-room"
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  activePlacementTargetValid
                    ? "bg-accent-tint text-on-accent-tint"
                    : "bg-danger-tint text-on-danger-tint"
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
                    ? "bg-accent-tint text-on-accent-tint"
                    : pendingCatalogPlacementQuality.tone === "warn"
                      ? "bg-warning-tint text-on-warning-tint"
                      : "bg-danger-tint text-on-danger-tint"
                }`}
              >
                {pendingCatalogPlacementQuality.label}
              </span>
            )}
          </div>
          {pendingCatalogPlacementScore && (
            <div
              data-testid="catalog-placement-score-card"
              className="mt-2 rounded-lg border border-separator bg-surface-floating p-3 md:p-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-label-secondary">
                    Placement score
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-label">
                    {pendingCatalogPlacementScore.label} · {pendingCatalogPlacementScore.score}/100
                  </div>
                </div>
                <div
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    pendingCatalogPlacementScore.relationship === "good"
                      ? "bg-success-tint text-on-success-tint"
                      : pendingCatalogPlacementScore.relationship === "wrong"
                        ? "bg-warning-tint text-on-warning-tint"
                        : "bg-control-track text-label-secondary"
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
              <div className="mt-2 text-xs text-label-secondary">
                {pendingCatalogPlacementScore.summary}
              </div>
              {pendingCatalogPlacementScore.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-on-warning-tint md:mt-1">
                  {pendingCatalogPlacementScore.warnings.slice(0, 3).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {pendingCatalogPlacementScore.suggestions.length > 0 && (
                <div className="mt-2 text-xs text-label-secondary md:hidden">
                  {pendingCatalogPlacementScore.suggestions[0]}
                </div>
              )}
              {pendingCatalogPlacementImprovement && (
                <div
                  data-testid="catalog-placement-improvement-hint"
                  className="mt-2 rounded-md bg-success-tint px-2.5 py-1.5 text-xs font-semibold text-on-success-tint"
                >
                  Better nearby spot available: +{pendingCatalogPlacementImprovement.scoreDelta} to{" "}
                  {pendingCatalogPlacementImprovement.score}/100.
                </div>
              )}
              {pendingCatalogBestRoomPlacement && (
                <div
                  data-testid="catalog-placement-best-room-hint"
                  className="mt-2 rounded-md bg-accent-tint px-2.5 py-1.5 text-xs font-semibold text-on-accent-tint"
                >
                  Best room: {pendingCatalogBestRoomPlacement.roomName} · +
                  {pendingCatalogBestRoomPlacement.scoreDelta} to{" "}
                  {pendingCatalogBestRoomPlacement.score}/100.
                </div>
              )}
              {pendingCatalogBestVariantPlacement && (
                <div
                  data-testid="catalog-placement-best-option-hint"
                  className="mt-2 rounded-md bg-accent-tint px-2.5 py-1.5 text-xs font-semibold text-on-accent-tint"
                >
                  Best option: {pendingCatalogBestVariantPlacement.variantLabel} · +
                  {pendingCatalogBestVariantPlacement.scoreDelta} to{" "}
                  {pendingCatalogBestVariantPlacement.score}/100.
                </div>
              )}
              {pendingCatalogPlacementScore.compatibleZoneIds.length > 0 && (
                <div className="mt-2 text-xs font-semibold text-on-success-tint md:hidden">
                  Compatible zones are highlighted on the canvas.
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-2">
            <Button
              data-testid="catalog-placement-auto-place"
              variant="secondary" size="regular"
              onClick={actions.onAutoPlace}
            >
              Find open spot
            </Button>
            {pendingCatalogBestRoomPlacement ? (
              <Button
                data-testid="catalog-placement-best-room"
                variant="secondary" size="regular"
                onClick={actions.onMoveToBestRoom}
              >
                Best room
              </Button>
            ) : null}
            {pendingCatalogBestVariantPlacement ? (
              <Button
                data-testid="catalog-placement-best-option"
                variant="secondary" size="regular"
                onClick={actions.onSwitchToBestOption}
              >
                Best option
              </Button>
            ) : null}
            {pendingCatalogPlacementImprovement ? (
              <Button
                data-testid="catalog-placement-improve"
                variant="secondary" size="regular"
                onClick={actions.onImprovePlacement}
              >
                Improve placement
              </Button>
            ) : null}
            {pendingCatalogPlacementBlocked && hasRestorablePlacement ? (
              <Button
                data-testid="catalog-placement-restore-valid"
                variant="secondary" size="regular"
                onClick={actions.onRestoreValidPlacement}
              >
                Back to valid spot
              </Button>
            ) : null}
            {pendingCatalogPlacementBlocked ? (
              <Button
                data-testid="catalog-placement-select-blocker"
                variant="danger" size="regular"
                onClick={actions.onSelectBlocker}
              >
                Select blocker
              </Button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("swap_with_blocker") ? (
              <Button
                data-testid="catalog-placement-swap-blocker"
                variant="secondary" size="regular"
                onClick={actions.onSwapWithBlocker}
              >
                Swap with blocker
              </Button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("move_blocker_aside") ? (
              <Button
                data-testid="catalog-placement-move-blocker"
                variant="secondary" size="regular"
                onClick={actions.onMoveBlockerAside}
              >
                Move blocker aside
              </Button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("place_beside_blocker") ? (
              <Button
                data-testid="catalog-placement-beside-blocker"
                variant="secondary" size="regular"
                onClick={actions.onPlaceBesideBlocker}
              >
                Place beside blocker
              </Button>
            ) : null}
            {pendingCatalogPlacementScore?.actions.includes("try_smaller_variant") ? (
              <Button
                data-testid="catalog-placement-smaller-variant"
                variant="secondary" size="regular"
                onClick={actions.onTrySmallerVariant}
              >
                Try smaller variant
              </Button>
            ) : null}
            <Button
              data-testid="catalog-placement-center"
              variant="secondary" size="regular"
              onClick={actions.onCenter}
            >
              Centre
            </Button>
            <Button
              size="icon" data-testid="catalog-placement-nudge-left"
              aria-label="Nudge placement left"
              onClick={() => actions.onNudge(-nudgeStepMeters, 0)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="icon" data-testid="catalog-placement-nudge-up"
              aria-label="Nudge placement back"
              onClick={() => actions.onNudge(0, -nudgeStepMeters)}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="icon" data-testid="catalog-placement-nudge-down"
              aria-label="Nudge placement front"
              onClick={() => actions.onNudge(0, nudgeStepMeters)}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="icon" data-testid="catalog-placement-nudge-right"
              aria-label="Nudge placement right"
              onClick={() => actions.onNudge(nudgeStepMeters, 0)}
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="sticky bottom-0 -mx-4 grid shrink-0 grid-cols-2 gap-2 border-t border-separator bg-surface-floating/95 px-4 pb-1 pt-3 backdrop-blur md:-mx-3 md:px-3 md:pb-0 md:pt-2">
          <Button
            data-testid="catalog-placement-rotate-left"
            variant="secondary" size="regular"
            onClick={() => actions.onRotate("left")}
          >
            Rotate left
          </Button>
          <Button
            data-testid="catalog-placement-rotate-right"
            variant="secondary" size="regular"
            onClick={() => actions.onRotate("right")}
          >
            Rotate right
          </Button>
          <Button
            data-testid="catalog-placement-cancel"
            variant="secondary" size="regular"
            onClick={actions.onCancel}
          >
            Cancel
          </Button>
          <Button
            data-testid="catalog-placement-confirm"
            variant="primary" size="regular"
            disabled={
              pendingCatalogPlacementHardInvalid &&
              !shouldConfirmImprovedCatalogPlacement &&
              !shouldConfirmRestoredCatalogPlacement
            }
            onClick={actions.onConfirm}
          >
            {shouldConfirmImprovedCatalogPlacement
              ? "Add best spot to"
              : shouldConfirmRestoredCatalogPlacement
                ? "Add valid spot to"
                : "Add to"}{" "}
            {pendingCatalogPlacementRoomName ?? activeRoomName ?? "room"}
          </Button>
        </div>
      </div>
    </div>
  );
}
