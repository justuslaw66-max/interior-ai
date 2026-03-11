"use client";

import { useState } from "react";

type Props = {
  catalogItemId: string;
  initialType: "shopify" | "affiliate" | "not_buyable" | "missing" | "mapped";
};

export default function CommerceEditor({ catalogItemId, initialType }: Props) {
  const [type, setType] = useState<"shopify" | "affiliate" | "not_buyable">(
    initialType === "missing" || initialType === "mapped" ? "not_buyable" : initialType
  );
  const [shopifyVariantId, setShopifyVariantId] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [retailer, setRetailer] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/catalog/${catalogItemId}/commerce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          shopifyVariantId,
          affiliateUrl,
          retailer,
          reason,
        }),
      });

      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "Save failed");

      setMessage("Commerce mapping saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded border p-3">
      <div>
        <label className="block text-xs text-neutral-600">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "shopify" | "affiliate" | "not_buyable")}
          className="mt-1 rounded border px-2 py-1 text-sm"
        >
          <option value="shopify">shopify</option>
          <option value="affiliate">affiliate</option>
          <option value="not_buyable">not_buyable</option>
        </select>
      </div>

      {type === "shopify" && (
        <div>
          <label className="block text-xs text-neutral-600">Shopify Variant ID</label>
          <input
            value={shopifyVariantId}
            onChange={(e) => setShopifyVariantId(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="gid://shopify/ProductVariant/..."
          />
        </div>
      )}

      {type === "affiliate" && (
        <div>
          <label className="block text-xs text-neutral-600">Affiliate URL</label>
          <input
            value={affiliateUrl}
            onChange={(e) => setAffiliateUrl(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="https://..."
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-neutral-600">Retailer</label>
        <input
          value={retailer}
          onChange={(e) => setRetailer(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          placeholder="Optional"
        />
      </div>

      <div>
        <label className="block text-xs text-neutral-600">Reason</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          placeholder="Optional"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="rounded border border-black bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save mapping"}
      </button>

      {message && <div className="text-sm text-neutral-700">{message}</div>}
    </div>
  );
}
