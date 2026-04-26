import RefreshPlanButton from "./RefreshPlanButton";
import Link from "next/link";

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id ?? "";

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">You’re on Pro 🎉</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your subscription checkout completed successfully.
        </p>

        {sessionId && (
          <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs font-mono break-all">
            Session: {sessionId}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/?mode=designer"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm text-white"
          >
            Open Designer mode
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-center text-sm"
          >
            Go to dashboard
          </Link>
        </div>

        <RefreshPlanButton />
      </div>
    </main>
  );
}
