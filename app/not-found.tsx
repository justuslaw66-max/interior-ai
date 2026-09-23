import Link from "next/link";

export const metadata = {
  title: "Page not found · Interior AI",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-950">We can&apos;t find that page</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          The link may be old or mistyped. Your designs are safe.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/design"
            className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white"
          >
            Start designing
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
          >
            My designs
          </Link>
        </div>
      </section>
    </main>
  );
}
