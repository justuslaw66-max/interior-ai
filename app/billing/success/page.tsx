import RefreshPlanButton from "./RefreshPlanButton";

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-grouped p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface-secondary p-6 shadow">
        <RefreshPlanButton />
      </div>
    </main>
  );
}
