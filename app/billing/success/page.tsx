import RefreshPlanButton from "./RefreshPlanButton";

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <RefreshPlanButton />
      </div>
    </main>
  );
}
