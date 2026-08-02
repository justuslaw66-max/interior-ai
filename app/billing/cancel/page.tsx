import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Checkout canceled</h1>
        <p className="mt-2 text-sm text-neutral-600">
          No worries — your plan has not changed.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm text-white"
          >
            Back to editor
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-center text-sm"
          >
            See plans
          </Link>
        </div>
      </div>
    </main>
  );
}
