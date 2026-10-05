"use client";

import { LogIn, UserRound } from "lucide-react";
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
  /** False until the session has loaded, so neither Sign in nor Account flashes for the wrong user. */
  accountReady: boolean;
  accountName: string | null;
  planLabel: string;
  canManageBilling: boolean;
  isOpeningBillingPortal: boolean;
  onManageBilling: () => void;
  onViewPlans: () => void;
};

/** The account's items: the Account menu's from md, and the end of the phone Menu's (UX 4d). */
export type AccountMenuItemsProps = Omit<CommandBarAccountMenuProps, "containerRef" | "open" | "onToggle" | "menuPanelClass">;

/**
 * The account corner (audit finding D), from md: nothing until the session has loaded, then Sign
 * in for guests, or an Account button with the user's initial and a menu with the plan, Pricing
 * or billing, and Sign out. Phones find the same items in the Menu.
 */
export function CommandBarAccountMenu(props: CommandBarAccountMenuProps) {
  const { dark, containerRef, open, onToggle } = props;
  if (!props.accountReady) {
    return <span aria-hidden="true" data-testid="editor-command-account-pending" className="h-9 w-9 shrink-0" />;
  }
  if (!props.isAuthed) return <CommandBarSignInButton dark={dark} />;
  const initial = props.accountName?.trim().charAt(0).toUpperCase();
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
            ? "designer-control inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold leading-none"
            : "inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 text-sm font-bold leading-none text-neutral-900 hover:bg-neutral-200"
        }
        onClick={onToggle}
      >
        {initial ? <span aria-hidden="true">{initial}</span> : <UserRound className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && <AccountMenuPanel {...props} />}
    </div>
  );
}

function AccountMenuPanel(props: CommandBarAccountMenuProps) {
  const { dark, menuPanelClass } = props;
  return (
    <div
      data-testid="editor-command-account-menu" data-touch-area
      role="menu"
      className={dark ? menuPanelClass : `${menuPanelClass} w-56`}
    >
      <AccountMenuItems {...props} />
    </div>
  );
}

export function AccountMenuItems(props: AccountMenuItemsProps) {
  const { dark } = props;
  if (!props.accountReady) return null;
  if (!props.isAuthed) return <CommandBarSignInButton dark={dark} menuButtonClass={props.menuButtonClass} />;
  return (
    <>
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
      <AccountBillingItem {...props} />
      <button
        type="button"
        data-testid="editor-command-sign-out"
        className={props.menuButtonClass}
        onClick={() => {
          props.onClose();
          signOut();
        }}
      >
        Sign out
      </button>
    </>
  );
}

function AccountBillingItem({
  menuButtonClass,
  onClose,
  canManageBilling,
  isOpeningBillingPortal,
  onManageBilling,
  onViewPlans,
}: AccountMenuItemsProps) {
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

/**
 * Guests sign in from the bar from md (the word from lg), and from the Menu on phones: given the
 * menu's item class, it's one of the Menu's items.
 */
function CommandBarSignInButton({ dark, menuButtonClass }: { dark: boolean; menuButtonClass?: string }) {
  return (
    <button
      type="button"
      role={menuButtonClass ? "menuitem" : undefined}
      data-testid="editor-command-sign-in"
      aria-label="Sign in"
      className={
        menuButtonClass ??
        (dark
          ? "designer-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-bold leading-none lg:w-auto lg:px-3.5"
          : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold leading-none text-neutral-900 hover:bg-neutral-50 lg:w-auto lg:px-3.5")
      }
      onClick={signInWithReturn}
    >
      {menuButtonClass ? null : <LogIn className="h-4 w-4 lg:hidden" aria-hidden="true" />}
      <span className={menuButtonClass ? undefined : "hidden lg:inline"}>Sign in</span>
    </button>
  );
}
