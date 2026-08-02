import { useState, type Dispatch, type SetStateAction } from "react";
import GoogleAddressAutocomplete from "@/components/GoogleAddressAutocomplete";
import type { GoogleResolvedAddress } from "@/lib/google-address-types";
import {
  ADDRESS_TRANSFORMS,
  createAddressBindingEvidenceDraft,
} from "./floorPlanReviewModel";
import type {
  AdminJob,
  BindingDraft,
  RenderedPage,
} from "./floorPlanReviewTypes";

const MANUAL_ADDRESS_FIELDS: Array<[string, keyof BindingDraft, string]> = [
  ["Country *", "countryCode", "SG"],
  ["Full searchable address *", "addressNormalized", "810A Chai Chee Street"],
  ["Postal code", "postalCode", "460810"],
  ["Block (if no postal code)", "block", "810A"],
  ["Street (if no postal code)", "street", "Chai Chee Street"],
];

const OPTIONAL_UNIT_FIELDS: Array<[string, keyof BindingDraft, string]> = [
  ["Stack / unit position (optional)", "stack", "09"],
  ["Floor min (optional)", "floorMin", "2"],
  ["Floor max (optional)", "floorMax", "15"],
];

function savedProofPageNumber(value: string) {
  try {
    const parsed = JSON.parse(value) as { pageNumber?: unknown };
    return Number.isInteger(parsed.pageNumber) ? Number(parsed.pageNumber) : null;
  } catch {
    return null;
  }
}

function hasConfirmedProof(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      reviewerConfirmation?: { confirmed?: unknown };
    };
    return parsed.reviewerConfirmation?.confirmed === true;
  } catch {
    return false;
  }
}

export function AddressBindingEditor({
  binding,
  documentId,
  index,
  pages,
  setBindings,
  canRemove,
  sourceAsset,
}: {
  binding: BindingDraft;
  documentId: string | null;
  index: number;
  pages: RenderedPage[];
  setBindings: Dispatch<SetStateAction<BindingDraft[]>>;
  canRemove: boolean;
  sourceAsset: AdminJob["sourceAsset"];
}) {
  const [proofPageNumber, setProofPageNumber] = useState(
    () => savedProofPageNumber(binding.sourceEvidenceText) ?? pages[0]?.pageNumber ?? 1
  );
  const [proofConfirmed, setProofConfirmed] = useState(() =>
    hasConfirmedProof(binding.sourceEvidenceText)
  );
  const proofPage =
    pages.find((page) => page.pageNumber === proofPageNumber) ?? pages[0] ?? null;
  const addressReady = Boolean(
    binding.countryCode.trim().length === 2 &&
    binding.addressNormalized.trim() &&
    (binding.postalCode.trim() ||
      (binding.block.trim() && binding.street.trim()))
  );
  const canConfirmProof = Boolean(
    addressReady && documentId && proofPage
  );
  const proofReady = proofConfirmed && Boolean(binding.sourceEvidenceText.trim());

  const applyGeneratedProof = (next: BindingDraft, page = proofPage) => {
    if (!proofConfirmed) return next;
    if (!documentId || !page || !next.addressNormalized.trim()) {
      return { ...next, sourceEvidenceText: "" };
    }
    return {
      ...next,
      sourceEvidenceText: createAddressBindingEvidenceDraft({
        binding: next,
        documentId,
        page,
        sourceAsset,
      }),
    };
  };

  const update = (field: keyof BindingDraft, value: string) =>
    setBindings((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? applyGeneratedProof({ ...entry, [field]: value })
          : entry
      )
    );

  const applyGoogleAddress = (address: GoogleResolvedAddress) =>
    setBindings((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? applyGeneratedProof({
              ...entry,
              countryCode: address.countryCode,
              addressNormalized: address.addressNormalized,
              postalCode: address.postalCode,
              block: address.block,
              street: address.street,
            })
          : entry
      )
    );

  const setProofConfirmation = (confirmed: boolean) => {
    setProofConfirmed(confirmed);
    setBindings((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        if (!confirmed || !documentId || !proofPage) {
          return { ...entry, sourceEvidenceText: "" };
        }
        return {
          ...entry,
          sourceEvidenceText: createAddressBindingEvidenceDraft({
            binding: entry,
            documentId,
            page: proofPage,
            sourceAsset,
          }),
        };
      })
    );
  };

  const changeProofPage = (pageNumber: number) => {
    setProofPageNumber(pageNumber);
    const nextPage = pages.find((page) => page.pageNumber === pageNumber) ?? null;
    if (!proofConfirmed || !documentId || !nextPage) return;
    setBindings((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              sourceEvidenceText: createAddressBindingEvidenceDraft({
                binding: entry,
                documentId,
                page: nextPage,
                sourceAsset,
              }),
            }
          : entry
      )
    );
  };

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-3 text-xs leading-5 text-neutral-600">
        Minimum: full address plus postal code (or block and street). Add stack /
        unit position and floor range only when the source proves an exact unit match.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <GoogleAddressAutocomplete
            countryCode={binding.countryCode || "SG"}
            id={`floor-plan-binding-address-${binding.key}`}
            label="Search and confirm address with Google"
            onSelect={applyGoogleAddress}
            onValueChange={(value) => update("addressNormalized", value)}
            placeholder="Search an address, building or postal code"
            testId={`floor-plan-binding-google-address-${index}`}
            value={binding.addressNormalized}
          />
          <p className="text-[11px] leading-4 text-neutral-500">
            Selecting a result fills the address components below. It confirms
            the location only; the uploaded plan still needs independent source proof.
          </p>
        </div>
        {OPTIONAL_UNIT_FIELDS.map(([label, field, placeholder]) => (
          <label
            className="text-xs font-medium text-neutral-700"
            key={field}
          >
            {label}
            <input
              className="mt-1 w-full rounded border p-2 text-sm"
              onChange={(event) => update(field, event.target.value)}
              placeholder={placeholder}
              value={binding[field]}
            />
          </label>
        ))}
        <section
          aria-labelledby={`address-proof-heading-${binding.key}`}
          className={`rounded-lg border p-3 sm:col-span-2 lg:col-span-4 ${
            proofReady
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4
                className="text-sm font-semibold text-neutral-900"
                id={`address-proof-heading-${binding.key}`}
              >
                Confirm address proof
              </h4>
              <p className="mt-1 text-xs leading-5 text-neutral-600">
                Choose the uploaded source page that shows this address. The
                audit record is created automatically.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                proofReady
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {proofReady ? "Proof ready" : "Confirmation needed"}
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="text-xs font-medium text-neutral-700">
              Source page
              <select
                className="mt-1 w-full rounded border bg-white p-2 text-sm"
                data-testid={`floor-plan-binding-proof-page-${index}`}
                disabled={!pages.length}
                onChange={(event) => changeProofPage(Number(event.target.value))}
                value={proofPage?.pageNumber ?? ""}
              >
                {pages.map((page) => (
                  <option key={page.pageNumber} value={page.pageNumber}>
                    Page {page.pageNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-black/10 bg-white p-3 text-xs text-neutral-700">
              <input
                checked={proofConfirmed}
                className="mt-0.5"
                data-testid={`floor-plan-binding-proof-confirmed-${index}`}
                disabled={!canConfirmProof}
                onChange={(event) => setProofConfirmation(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong className="block font-semibold text-neutral-900">
                  I checked {proofPage ? `Page ${proofPage.pageNumber}` : "the source"}
                  {" "}and it shows this address.
                </strong>
                <span className="mt-1 block leading-4 text-neutral-500">
                  {binding.stack.trim() ||
                  (binding.floorMin.trim() && binding.floorMax.trim())
                    ? "It also shows the optional unit position and floor range entered above."
                    : "Unit position and floor proof are only needed when those optional fields are used."}
                </span>
              </span>
            </label>
          </div>
          {!canConfirmProof ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              {!binding.addressNormalized.trim()
                ? "Choose an address before confirming its source."
                : !addressReady
                  ? "Select a Google result, or complete the postal code or block and street in Advanced settings."
                  : "The rendered source page is not available yet."}
            </p>
          ) : null}
        </section>

        <details className="rounded-md border border-neutral-200 p-3 sm:col-span-2 lg:col-span-4">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-700">
            Advanced settings
          </summary>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">
            Manual address fields, layout orientation, and raw audit data are
            available here for exceptional cases.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MANUAL_ADDRESS_FIELDS.map(([label, field, placeholder]) => (
              <label
                className={`text-xs font-medium text-neutral-700 ${
                  field === "addressNormalized" ? "sm:col-span-2" : ""
                }`}
                key={field}
              >
                {label}
                <input
                  className="mt-1 w-full rounded border p-2 text-sm"
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={placeholder}
                  value={binding[field]}
                />
              </label>
            ))}
            <label className="text-xs font-medium text-neutral-700 sm:col-span-2">
              Library role
              <select
                className="mt-1 w-full rounded border p-2 text-sm"
                onChange={(event) =>
                  update("role", event.target.value as BindingDraft["role"])
                }
                value={binding.role}
              >
                <option value="catalog">Searchable catalog layout</option>
                <option value="authored_variant">Non-searchable authored variant</option>
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700 sm:col-span-2">
              Layout orientation
              <select
                className="mt-1 w-full rounded border p-2 text-sm"
                onChange={(event) => update("transform", event.target.value)}
                value={binding.transform}
              >
                {ADDRESS_TRANSFORMS.map((transform) => (
                  <option key={transform} value={transform}>
                    {transform}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700 sm:col-span-2 lg:col-span-4">
              Raw proof data (support use only)
              <textarea
                className="mt-1 min-h-32 w-full rounded border p-2 font-mono text-[11px]"
                onChange={(event) => {
                  const value = event.target.value;
                  setProofConfirmed(hasConfirmedProof(value));
                  setBindings((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, sourceEvidenceText: value }
                        : entry
                    )
                  );
                }}
                value={binding.sourceEvidenceText}
              />
            </label>
          </div>
        </details>
      </div>
      <button
        className="mt-3 text-xs font-medium text-red-700 disabled:opacity-40"
        disabled={!canRemove}
        onClick={() =>
          setBindings((current) =>
            current.filter((_, entryIndex) => entryIndex !== index)
          )
        }
        type="button"
      >
        Remove binding
      </button>
    </div>
  );
}
