"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useClientHydrated } from "@/lib/useClientHydrated";

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/**
 * My designs for guests (audit finding MD2): a sign-in prompt instead of a silent redirect.
 * Signing in comes back here.
 */
export function MyDesignsSignedOut() {
  const hydrated = useClientHydrated();
  return (
    <main data-testid="my-designs-signed-out" data-client-hydrated={hydrated ? "true" : "false"}
      className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-8 sm:px-8">
      <h1 className="text-[30px] font-bold leading-9 tracking-tight">My designs</h1>
      <section aria-labelledby="my-designs-sign-in-title"
        className="mt-6 flex max-w-[560px] flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 id="my-designs-sign-in-title" className="text-lg font-bold">Sign in to see your designs</h2>
        <p className="text-[15px] leading-[22px] text-neutral-600">
          Designs you save to your account show up here, on any device. A design you started without
          an account moves in when you sign in.
        </p>
        <div className="mt-1 flex flex-wrap gap-2.5">
          <button type="button" data-testid="my-designs-sign-in"
            onClick={() => void signIn("google", { callbackUrl: "/dashboard" })}
            className={`flex h-11 items-center rounded-[10px] bg-neutral-900 px-5 text-[15px] font-bold text-white hover:bg-neutral-800 ${FOCUS_RING}`}>
            Continue with Google
          </button>
          <Link href="/design" data-testid="my-designs-continue-as-guest"
            className={`flex h-11 items-center rounded-[10px] border border-neutral-300 bg-white px-5 text-[15px] font-bold text-neutral-900 hover:bg-neutral-100 ${FOCUS_RING}`}>
            Design without an account
          </Link>
        </div>
      </section>
    </main>
  );
}
