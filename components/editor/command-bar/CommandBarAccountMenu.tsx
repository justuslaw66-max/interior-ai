"use client";

import { UserRound } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import type { RefObject } from "react";
import { PLANS_ACCOUNT_OPENER_ID } from "@/lib/plans-dialog-focus";

function signInWithReturn() {
  signIn("google", { callbackUrl: window.location.href });
}

type CommandBarAccountMenuProps = {
  dark: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  menuButtonClass: string;
  menuPanelClass: string;
  isAuthed: boolean;
  planLabel: string;
  canManageBilling: boolean;
  isOpeningBillingPortal: boolean;
  onManageBilling: () => void;
  onViewPlans: () => void;
};

/** The command bar's Account button and menu: the plan, Pricing or billing, and sign in or out. */
export function CommandBarAccountMenu(props: CommandBarAccountMenuProps) {
  const { dark, containerRef, open, onToggle, menuPanelClass } = props;
  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        id={PLANS_ACCOUNT_OPENER_ID} type="button"
        data-testid="editor-command-account"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          dark
            ? "designer-control inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-sm font-semibold leading-none lg:w-auto lg:px-3"
            : "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-800 hover:bg-neutral-50 lg:w-auto lg:px-3"
        }
        onClick={onToggle}
      >
        <UserRound className="h-4 w-4 lg:hidden" aria-hidden="true" />
        <span className="hidden lg:inline">Account</span>
      </button>
      {open && (
        <div
          data-testid="editor-command-account-menu"
          role="menu"
          className={dark ? menuPanelClass : `${menuPanelClass} w-56`}
        >
          <div
            data-testid="editor-account-plan"
            className={
              dark
                ? "designer-work-muted mb-1 rounded-lg px-3 py-2 text-xs font-semibold"
                : "mb-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-600"
            }
          >
            {props.planLabel}
          </div>
          {props.isAuthed && <AccountBillingItem {...props} />}
          <AccountSessionItem {...props} />
        </div>
      )}
    </div>
  );
}

function AccountBillingItem({
  menuButtonClass,
  onClose,
  canManageBilling,
  isOpeningBillingPortal,
  onManageBilling,
  onViewPlans,
}: CommandBarAccountMenuProps) {
  return canManageBilling ? (
    <button
      type="button"
      data-testid="editor-command-manage-billing"
      className={menuButtonClass}
      disabled={isOpeningBillingPortal}
      onClick={() => {
        onClose();
        onManageBilling();
      }}
    >
      {isOpeningBillingPortal ? "Opening billing…" : "Manage billing"}
    </button>
  ) : (
    <button
      type="button"
      data-testid="editor-command-view-plans"
      className={menuButtonClass}
      onClick={() => {
        onClose();
        onViewPlans();
      }}
    >
      Pricing
    </button>
  );
}

function AccountSessionItem({ menuButtonClass, onClose, isAuthed }: CommandBarAccountMenuProps) {
  return isAuthed ? (
    <button
      type="button"
      data-testid="editor-command-sign-out"
      className={menuButtonClass}
      onClick={() => {
        onClose();
        signOut();
      }}
    >
      Sign out
    </button>
  ) : (
    <button
      type="button"
      data-testid="editor-command-sign-in"
      className={menuButtonClass}
      onClick={() => {
        onClose();
        signInWithReturn();
      }}
    >
      Sign in
    </button>
  );
}
