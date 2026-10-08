import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./operations-dashboard.module.css";

export type AdminCrumb = { title: string; href?: string };

/**
 * An admin page's heading (UX phase 4i): breadcrumbs from Admin down to the page, which replace
 * the old "Back to …" links, then the title, a line of description and any page actions.
 */
export function AdminPageHeader({
  crumbs,
  title,
  description,
  actions,
}: {
  crumbs: readonly AdminCrumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const trail: AdminCrumb[] = [{ title: "Admin", href: "/admin" }, ...crumbs];
  return (
    <header className={styles.pageHeader}>
      <div>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <ol className={styles.breadcrumbList}>
            {trail.map((crumb, index) => {
              const last = index === trail.length - 1;
              return (
                <li key={`${crumb.title}-${index}`}>
                  {crumb.href && !last ? (
                    <Link href={crumb.href}>{crumb.title}</Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined}>{crumb.title}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className={styles.pageHeaderActions}>{actions}</div> : null}
    </header>
  );
}
