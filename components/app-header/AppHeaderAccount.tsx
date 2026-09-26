"use client";

import { useRef, useState } from "react";
import { LogIn, UserRound } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useDismissibleMenu } from "@/lib/useDismissibleMenu";

export type AppHeaderAccountInfo = {
  name: string | null;
  email: string | null;
  /** "Free plan" or "Pro plan". */
  planLabel: string;
};

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/** Sign in for guests; for members, their initial and a menu with the plan and Sign out. */
export function AppHeaderAccount({ account }: { account: AppHeaderAccountInfo | null }) {
  if (!account) {
    return (
      <button type="button" data-testid="app-header-sign-in"
        onClick={() => void signIn("google", { callbackUrl: window.location.href })}
        className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 text-sm font-bold text-white hover:bg-neutral-800 ${FOCUS_RING}`}>
        <LogIn aria-hidden="true" className="hidden h-4 w-4 sm:block" strokeWidth={1.8} />
        Sign in
      </button>
    );
  }
  return <AccountMenu account={account} />;
}

function AccountMenu({ account }: { account: AppHeaderAccountInfo }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useDismissibleMenu({
    open,
    containerRef,
    onDismiss: (byKeyboard) => {
      setOpen(false);
      if (byKeyboard) buttonRef.current?.focus();
    },
  });
  const label = account.name ?? account.email ?? "Your account";
  const initial = label.trim().charAt(0).toUpperCase();
  return (
    <div ref={containerRef} className="relative">
      <button ref={buttonRef} type="button" data-testid="app-header-account" aria-label="Account"
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 text-[15px] font-bold text-neutral-900 hover:bg-neutral-200 ${FOCUS_RING}`}>
        {initial ? <span aria-hidden="true">{initial}</span> : <UserRound aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />}
      </button>
      {open ? (
        <div role="menu" aria-label="Account" data-testid="app-header-account-menu"
          className="absolute right-0 top-12 z-20 flex w-64 flex-col rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
          <div className="flex flex-col gap-0.5 px-3 py-2 text-sm">
            <span className="truncate font-bold text-neutral-950">{label}</span>
            {account.name && account.email ? <span className="truncate text-neutral-600">{account.email}</span> : null}
            <span data-testid="app-header-plan" className="text-neutral-600">{account.planLabel}</span>
          </div>
          <div className="my-1 h-px bg-neutral-200" />
          <button type="button" role="menuitem" data-testid="app-header-sign-out"
            onClick={() => void signOut({ callbackUrl: "/" })}
            className={`flex h-10 items-center rounded-lg px-3 text-left text-sm font-bold text-neutral-900 hover:bg-neutral-100 ${FOCUS_RING}`}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
