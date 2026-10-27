"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import DuplicateDesignButton from "@/components/DuplicateDesignButton";

export function ShareFooterCTA({ shareToken }: { shareToken?: string }) {
  return (
    <footer className="mx-auto max-w-6xl px-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-box-border bg-surface-secondary px-4 py-3 shadow">
        <div className="text-sm text-label-secondary">Made with Interior AI</div>
        <div
          className="flex flex-wrap items-center justify-end gap-2"
          data-testid="share-footer-actions"
        >
          {shareToken ? (
            <DuplicateDesignButton
              shareToken={shareToken}
              data-share-touch-target="true"
              className="inline-flex min-h-11 items-center rounded-lg bg-control-primary px-3 py-2 text-sm text-control-on-primary outline-offset-2 focus-visible:outline-2 disabled:opacity-70"
            >
              Make a copy
            </DuplicateDesignButton>
          ) : null}
          <Link
            href="/?source=share"
            data-share-touch-target="true"
            className="inline-flex min-h-11 items-center rounded-lg border border-control-secondary-border bg-control-secondary px-3 py-2 text-sm text-label outline-offset-2 hover:bg-control-secondary-hover focus-visible:outline-2"
            onClick={() => track("share_cta_clicked", { source: "share_page" })}
          >
            Start your own design
          </Link>
        </div>
      </div>
    </footer>
  );
}
