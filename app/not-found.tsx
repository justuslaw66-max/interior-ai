import Link from "next/link";

export const metadata = {
  title: "Page not found · Interior AI",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-grouped p-6">
      <section className="w-full max-w-md rounded-lg border border-box-border bg-surface-secondary p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-label">We can&apos;t find that page</h1>
        <p className="mt-3 text-sm leading-6 text-label-secondary">
          The link may be old or mistyped. Your designs are safe.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/design"
            className="rounded-md bg-control-primary px-4 py-2 text-sm font-medium text-control-on-primary"
          >
            Start designing
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-control-secondary-border bg-control-secondary px-4 py-2 text-sm font-medium text-label"
          >
            My designs
          </Link>
        </div>
      </section>
    </main>
  );
}
