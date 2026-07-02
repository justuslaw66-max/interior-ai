export type RevenueFunnelCounts = {
  landingViewed: number;
  designStarted: number;
  firstItemAdded: number;
  thirdItemAdded: number;
  exportClicked: number;
  upgradeClicked: number;
  checkoutStarted: number;
  checkoutCompleted: number;
};

export type RevenueFunnelMetrics = {
  startRate: string;
  firstPlacementRate: string;
  thirdPlacementRate: string;
  exportIntentRate: string;
  paywallCtr: string;
  purchaseConversion: string;
  prePlacementDropoff: number;
  preExportDropoff: number;
};

export function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function computeRevenueFunnelMetrics(counts: RevenueFunnelCounts): RevenueFunnelMetrics {
  return {
    startRate: formatPercent(counts.designStarted, counts.landingViewed),
    firstPlacementRate: formatPercent(counts.firstItemAdded, counts.designStarted),
    thirdPlacementRate: formatPercent(counts.thirdItemAdded, counts.designStarted),
    exportIntentRate: formatPercent(counts.exportClicked, counts.designStarted),
    paywallCtr: formatPercent(counts.upgradeClicked, counts.exportClicked),
    purchaseConversion: formatPercent(counts.checkoutCompleted, counts.checkoutStarted),
    prePlacementDropoff: Math.max(0, counts.designStarted - counts.firstItemAdded),
    preExportDropoff: Math.max(0, counts.firstItemAdded - counts.exportClicked),
  };
}