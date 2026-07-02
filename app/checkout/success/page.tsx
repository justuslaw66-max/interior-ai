import ConfirmOrderClient from "./confirm-client";
import Link from "next/link";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { order_id?: string; orderId?: string; designId?: string };
}) {
  const orderRef = searchParams.order_id ?? searchParams.orderId ?? "";
  const designId = searchParams.designId ?? null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Thank you 🎉</h1>

        <p className="mt-2 text-sm text-neutral-600">
          Your order has been placed successfully.
        </p>

        {orderRef && (
          <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs font-mono">
            Order Ref: {orderRef}
          </div>
        )}

        <ConfirmOrderClient orderRef={orderRef} designId={designId} />

        <div className="mt-6 flex flex-col gap-2">
          {designId ? (
            <Link
              href={`/design/${designId}`}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm text-white"
            >
              Back to this design
            </Link>
          ) : (
            <Link
              href="/"
              className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm text-white"
            >
              Back to my design
            </Link>
          )}

          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-center text-sm"
          >
            View my designs
          </Link>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          External items (if any) were purchased separately from their retailers.
        </p>
      </div>
    </main>
  );
}
