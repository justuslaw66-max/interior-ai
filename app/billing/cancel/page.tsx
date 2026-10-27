import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-grouped p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface-secondary p-6 shadow">
        <h1 className="text-2xl font-semibold">Checkout cancelled</h1>
        <p className="mt-2 text-sm text-label-secondary">
          No worries — nothing has changed on your account.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/design"
            className="rounded-xl bg-control-primary px-4 py-2 text-center text-sm text-control-on-primary"
          >
            Back to editor
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-control-secondary-border bg-control-secondary px-4 py-2 text-center text-sm text-label"
          >
            My designs
          </Link>
        </div>
      </div>
    </main>
  );
}
