"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn } from "next-auth/react";
import { LockKeyhole } from "lucide-react";
import styles from "./operations-dashboard.module.css";

/**
 * What a visitor who isn't an admin sees instead of a silent redirect to the editor (UX phase 4i,
 * audit AD9). Signed out: sign in, coming back to this page. Signed in with another account: say
 * whose area this is, and offer the designer or another account.
 */
export function AdminAccessDenied({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/admin";
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.panel} data-testid="admin-access-denied" aria-labelledby="admin-access-title">
          <div className={styles.accessState}>
            <LockKeyhole aria-hidden="true" />
            <div>
              <h1 id="admin-access-title">{signedIn ? "This area is for the Interior AI team" : "Sign in to open Admin"}</h1>
              <p>
                {signedIn
                  ? "This account can't open Admin. Switch to your team account, or go back to designing."
                  : "Admin is where the Interior AI team runs the catalogue and reviews imports. Sign in with your team account."}
              </p>
              <div className={styles.accessActions}>
                {signedIn ? (
                  <>
                    <Link className={styles.primaryAction} href="/design" data-testid="admin-access-open-designer">
                      Open designer
                    </Link>
                    <button
                      type="button"
                      className={styles.quietAction}
                      data-testid="admin-access-switch-account"
                      onClick={() => void signIn("google", { callbackUrl: pathname }, { prompt: "select_account" })}
                    >
                      Switch account
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      data-testid="admin-access-sign-in"
                      onClick={() => void signIn("google", { callbackUrl: pathname })}
                    >
                      Sign in
                    </button>
                    <Link className={styles.quietAction} href="/design" data-testid="admin-access-open-designer">
                      Open designer
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
