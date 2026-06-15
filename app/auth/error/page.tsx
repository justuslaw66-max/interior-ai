import Link from "next/link";

const AUTH_ERROR_COPY: Record<string, { title: string; body: string }> = {
  Configuration: {
    title: "Google sign-in is not configured correctly",
    body:
      "The Google OAuth client secret in your environment is being rejected. Update GOOGLE_CLIENT_SECRET with the client secret from the same Google OAuth client as GOOGLE_CLIENT_ID, then restart the dev server.",
  },
  AccessDenied: {
    title: "Sign-in was denied",
    body:
      "Google did not grant access for this account. Try again with the account you use for this workspace.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error ?? "Configuration";
  const copy =
    AUTH_ERROR_COPY[errorCode] ??
    {
      title: "Sign-in could not be completed",
      body: "Try signing in again. If this repeats, check the local OAuth environment variables.",
    };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Auth error
        </div>
        <h1 className="mt-2 text-xl font-semibold text-neutral-950">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{copy.body}</p>
        <div className="mt-5 rounded-md bg-neutral-50 p-3 text-xs text-neutral-600">
          Error code: <span className="font-mono">{errorCode}</span>
        </div>
        <div className="mt-6 flex gap-3">
          <Link
            href="/design"
            className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white"
          >
            Back to design
          </Link>
          <Link
            href="/"
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700"
          >
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
