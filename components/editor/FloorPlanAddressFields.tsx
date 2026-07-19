"use client";

import GoogleAddressAutocomplete from "@/components/GoogleAddressAutocomplete";

type FloorPlanAddressFieldsProps = {
  dark: boolean;
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
  dark,
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
  const inputClass = dark
    ? "designer-control rounded-lg border px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
    : "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  return (
    <>
      <GoogleAddressAutocomplete
        className={inputClass}
        countryCode="SG"
        id="floor-plan-address-search"
        label="Search address or postal code"
        labelClassName={`mt-2 block text-[11px] font-semibold ${subtle}`}
        onSelect={(selected) => onAddressChange(selected.addressNormalized)}
        onValueChange={onAddressChange}
        placeholder="810A Chai Chee Street"
        testId="floor-plan-address-search"
        value={address}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className={`text-[10px] ${subtle}`}>
          Floor (optional)
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
        <label className={`text-[10px] ${subtle}`}>
          Stack / unit position (optional)
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
        data-testid="floor-plan-library-browse-toggle"
        aria-expanded={browseOpen}
        aria-controls="floor-plan-library-browse-results"
        onClick={onToggleBrowse}
        className={dark
          ? "designer-control mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-left"
          : "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold">Browse approved floor plans</span>
          <span className={`mt-0.5 block truncate text-[10px] ${subtle}`}>{browseAddressSummary}</span>
        </span>
        <span className={dark ? "shrink-0 text-[11px] font-semibold text-blue-200" : "shrink-0 text-[11px] font-semibold text-blue-700"}>
          {browseStatus === "loading" ? "Loading…" : browseStatus === "error" ? "Unavailable" : `${browseCount} plans`}
          <span aria-hidden="true" className="ml-1">{browseOpen ? "−" : "+"}</span>
        </span>
      </button>
    </>
  );
}
