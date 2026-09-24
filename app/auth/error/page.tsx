import Link from "next/link";

type AuthErrorCopy = { title: string; body: string; developerNote?: string };

const FALLBACK_COPY: AuthErrorCopy = {
  title: "Sign-in didn't work",
  body: "Something went wrong while signing you in. Your design is safe; please try again.",
};

const AUTH_ERROR_COPY: Record<string, AuthErrorCopy> = {
  Configuration: {
    title: "Sign-in is unavailable right now",
    body: "We couldn't reach the sign-in service. Your design is safe; please try again in a few minutes.",
    developerNote:
      "Google rejected the OAuth client secret. Set GOOGLE_CLIENT_SECRET to the secret of the same OAuth client as GOOGLE_CLIENT_ID, then restart the dev server.",
  },
  AccessDenied: {
    title: "Sign-in was cancelled",
    body: "Google didn't share access for this account. Try again, or choose another Google account.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error;
  const copy = (errorCode && AUTH_ERROR_COPY[errorCode]) || FALLBACK_COPY;
  const developerNote =
    process.env.NODE_ENV !== "production" ? copy.developerNote : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <section className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-950">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{copy.body}</p>
        {developerNote ? (
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900" data-testid="auth-error-developer-note">
            Development only: {developerNote}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/design"
            className="rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white"
          >
            Back to your design
          </Link>
          {errorCode ? (
            <span className="text-xs text-neutral-500">
              Reference: <span className="font-mono">{errorCode}</span>
            </span>
          ) : null}
        </div>
      </section>
    </main>
  );
}
