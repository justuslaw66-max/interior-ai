import ConfirmOrderClient from "./confirm-client";
import Link from "next/link";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    order_id?: string;
    orderId?: string;
    designId?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const orderRef =
    resolvedSearchParams.order_id ?? resolvedSearchParams.orderId ?? "";
  const designId = resolvedSearchParams.designId ?? null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-grouped p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface-secondary p-6 shadow">
        <h1 className="text-2xl font-semibold">Thank you 🎉</h1>

        <p className="mt-2 text-sm text-label-secondary">
          If you finished checkout, your order is placed. Shopify will email
          your receipt and order updates.
        </p>

        {orderRef && (
          <div className="mt-3 rounded-lg bg-tile p-3 text-xs font-mono">
            Reference: {orderRef}
          </div>
        )}

        <ConfirmOrderClient orderRef={orderRef} designId={designId} />

        <div className="mt-6 flex flex-col gap-2">
          {designId ? (
            <Link
              href={buildDesignEditorUrl({ designId })}
              className="rounded-xl bg-control-primary px-4 py-2 text-center text-sm text-control-on-primary"
            >
              Back to this design
            </Link>
          ) : (
            <Link
              href="/"
              className="rounded-xl bg-control-primary px-4 py-2 text-center text-sm text-control-on-primary"
            >
              Back to my design
            </Link>
          )}

          <Link
            href="/dashboard"
            className="rounded-xl border border-control-secondary-border bg-control-secondary px-4 py-2 text-center text-sm text-label"
          >
            My designs
          </Link>
        </div>

        <p className="mt-4 text-xs text-label-secondary">
          External items (if any) were purchased separately from their retailers.
        </p>
      </div>
    </main>
  );
}
