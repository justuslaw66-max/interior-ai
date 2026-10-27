"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button, buttonClassName } from "@/components/ui/Button";
import { useClientHydrated } from "@/lib/useClientHydrated";

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
        className="mt-6 flex max-w-[560px] flex-col gap-3 rounded-2xl border border-box-border bg-surface-secondary p-6">
        <h2 id="my-designs-sign-in-title" className="text-lg font-bold">Sign in to see your designs</h2>
        <p className="text-[15px] leading-[22px] text-label-secondary">
          Designs you save to your account show up here, on any device. A design you started without
          an account moves in when you sign in.
        </p>
        <div className="mt-1 flex flex-wrap gap-2.5">
          <Button variant="primary" data-testid="my-designs-sign-in"
            onClick={() => void signIn("google", { callbackUrl: "/dashboard" })}>
            Continue with Google
          </Button>
          <Link href="/design" data-testid="my-designs-continue-as-guest" className={buttonClassName()}>
            Design without an account
          </Link>
        </div>
      </section>
    </main>
  );
}
