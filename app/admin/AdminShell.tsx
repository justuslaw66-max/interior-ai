import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, PanelsTopLeft } from "lucide-react";
import { AdminNav } from "./AdminNav";
import styles from "./operations-dashboard.module.css";

/**
 * Every admin page's frame (UX phase 4i): the brand, the section menu, Open designer and the
 * signed-in admin's initial. The layout renders it once an admin's access is confirmed. Admin stays
 * light whatever the device: data-color-scheme="light" holds the light colour tokens (dark mode
 * plan, decision 7), and data-light-page the whole window, so the page behind is light too.
 */
export function AdminShell({ userEmail, children }: { userEmail: string | null; children: ReactNode }) {
  const userInitial = userEmail?.trim().charAt(0).toUpperCase() || "A";
  return (
    <div className={styles.page} data-color-scheme="light" data-light-page>
      <header className={styles.appHeader}>
        <div className={styles.appHeaderInner}>
          <Link className={styles.brand} href="/admin" aria-label="Interior AI admin overview">
            <span className={styles.brandMark}>
              <PanelsTopLeft aria-hidden="true" />
            </span>
            <span className={styles.brandText}>
              <strong>Interior AI</strong>
              <span>Admin</span>
            </span>
          </Link>
          <AdminNav />
          <div className={styles.headerActions}>
            <Link className={styles.secondaryAction} href="/design">
              Open designer
              <ExternalLink aria-hidden="true" />
            </Link>
            <span className={styles.userAvatar} title={userEmail ?? "Administrator"}>
              <span className={styles.srOnly}>{userEmail ?? "Administrator"}</span>
              {userInitial}
            </span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
