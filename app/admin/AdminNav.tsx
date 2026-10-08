"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_SECTIONS, adminSectionFor } from "./admin-navigation";
import styles from "./operations-dashboard.module.css";

/** Admin's menu: one item per section, the current one marked (UX phase 4i, audit AD2). */
export function AdminNav() {
  const current = adminSectionFor(usePathname() ?? "/admin");
  return (
    <nav className={styles.primaryNav} aria-label="Admin sections">
      {ADMIN_SECTIONS.map((section) => {
        const selected = current?.href === section.href;
        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={selected ? `${styles.primaryNavItem} ${styles.primaryNavItemSelected}` : styles.primaryNavItem}
            href={section.href}
            key={section.href}
          >
            {section.title}
          </Link>
        );
      })}
    </nav>
  );
}
