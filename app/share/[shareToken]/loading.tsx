export default function PublicShareLoading() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-neutral-100 p-8"
      data-testid="public-share-loading"
      data-layout-status="loading"
      aria-busy="true"
    >
      <div className="rounded-xl border bg-white p-6 text-sm text-neutral-600" role="status">
        Loading shared design…
      </div>
    </main>
  );
}
