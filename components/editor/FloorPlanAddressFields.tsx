"use client";

import GoogleAddressAutocomplete from "@/components/GoogleAddressAutocomplete";
import { DisclosureChevron } from "@/components/ui/DisclosureChevron";

type FloorPlanAddressFieldsProps = {
  address: string;
  floor: string;
  stack: string;
  browseOpen: boolean;
  browseCount: number;
  browseStatus: "loading" | "ready" | "error";
  browseAddressSummary: string;
  onAddressChange: (value: string) => void;
  onFloorChange: (value: string) => void;
  onStackChange: (value: string) => void;
  onToggleBrowse: () => void;
};

export default function FloorPlanAddressFields({
  address,
  floor,
  stack,
  browseOpen,
  browseCount,
  browseStatus,
  browseAddressSummary,
  onAddressChange,
  onFloorChange,
  onStackChange,
  onToggleBrowse,
}: FloorPlanAddressFieldsProps) {
  const inputClass = "rounded-lg border border-control-secondary-border bg-field px-3 py-2 text-sm text-label outline-hidden placeholder:text-label-tertiary focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const subtle = "text-label-secondary";

  return (
    <div className="ph-no-capture" data-private-floor-plan="true">
      <GoogleAddressAutocomplete
        className={inputClass}
        countryCode="SG"
        id="floor-plan-address-search"
        label="Search address or postal code"
        labelClassName={`mt-2 block text-xs font-semibold ${subtle}`}
        onSelect={(selected) => onAddressChange(selected.addressNormalized)}
        onValueChange={onAddressChange}
        placeholder="810A Chai Chee Street"
        testId="floor-plan-address-search"
        value={address}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className={`text-xs ${subtle}`}>
          Floor (required for exact match)
          <input
            data-testid="floor-plan-address-floor"
            inputMode="numeric"
            value={floor}
            maxLength={2}
            onChange={(event) => onFloorChange(event.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="12"
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
        <label className={`text-xs ${subtle}`}>
          Stack / unit position (required for exact match)
          <input
            data-testid="floor-plan-address-stack"
            inputMode="text"
            value={stack}
            maxLength={6}
            onChange={(event) => onStackChange(event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
            placeholder="09"
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
      </div>
      <button
        type="button"
        data-testid="floor-plan-library-browse-toggle" hidden={browseStatus === "ready" && browseCount === 0}
        aria-expanded={browseOpen}
        aria-controls="floor-plan-library-browse-results"
        onClick={onToggleBrowse}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-accent-tint-border bg-field px-3 py-2.5 text-left shadow-sm hover:border-accent-tint-border hover:bg-accent-tint"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold">Browse approved floor plans</span>
          <span className={`mt-0.5 block truncate text-xs ${subtle}`}>{browseAddressSummary}</span>
        </span>
        <span className="inline-flex shrink-0 items-center text-xs font-semibold text-on-accent-tint">
          {browseStatus === "loading" ? "Loading…" : browseStatus === "error" ? "Unavailable" : `${browseCount} plans`}
          <DisclosureChevron open={browseOpen} className="ml-1" />
        </span>
      </button>
    </div>
  );
}
