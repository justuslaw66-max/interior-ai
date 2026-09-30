import Link from "next/link";
import { AppHeaderAccount, type AppHeaderAccountInfo } from "@/components/app-header/AppHeaderAccount";
import { PRICING_HREF } from "@/lib/start-design-link";

const NAV_LINK =
  "flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-sm font-bold text-neutral-900 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600 sm:px-3";

type AppHeaderProps = {
  /** The page this header sits on, marked as the current one. */
  current?: "designs";
  /** Null for guests, who get Sign in. */
  account: AppHeaderAccountInfo | null;
};

/**
 * The header of the pages outside the editor (audit finding MD4), as in the My designs mockup:
 * the product, My designs, Pricing and the account. One row from 360px wide; below that the
 * links wrap under the product name instead of running off the screen.
 */
export function AppHeader({ current, account }: AppHeaderProps) {
  return (
    <header data-testid="app-header"
      className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-neutral-200 bg-white px-4 py-3 sm:px-8">
      <Link href="/" data-testid="app-header-home"
        className="-ml-2 flex h-10 items-center whitespace-nowrap rounded-lg px-2 text-base font-bold text-neutral-950 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600 sm:text-lg">
        Interior AI
      </Link>
      <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-3">
        <Link href="/dashboard" data-testid="app-header-my-designs" aria-current={current === "designs" ? "page" : undefined}
          className={current === "designs" ? `${NAV_LINK} bg-neutral-100` : NAV_LINK}>
          My designs
        </Link>
        <Link href={PRICING_HREF} data-testid="app-header-pricing" className={NAV_LINK}>
          Pricing
        </Link>
        <AppHeaderAccount account={account} />
      </nav>
    </header>
  );
}
