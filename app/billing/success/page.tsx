import RefreshPlanButton from "./RefreshPlanButton";

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Payment received</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Stripe returned your checkout successfully. We’re confirming Pro access on your account now.
        </p>

        <RefreshPlanButton />
      </div>
    </main>
  );
}
