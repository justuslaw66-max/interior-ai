/**
 * Admin's sections, in menu order (UX phase 4i, audit AD2). Each one's name is its page's heading,
 * its menu item and the first part of its tab title, so the three never disagree.
 */
export type AdminSection = {
  title: string;
  href: string;
};

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { title: "Overview", href: "/admin" },
  { title: "Catalog inbox", href: "/admin/catalog/inbox" },
  { title: "Catalog review", href: "/admin/catalog/review" },
  { title: "Import jobs", href: "/admin/imports" },
  { title: "Models", href: "/admin/models" },
  { title: "Floor-plan review", href: "/admin/floor-plans" },
  { title: "Catalog audit", href: "/admin/audit" },
  { title: "Affiliate clicks", href: "/admin/clicks" },
];

/** The section a page belongs to: the longest matching path, so /admin itself is only Overview. */
export function adminSectionFor(pathname: string): AdminSection | null {
  const matches = ADMIN_SECTIONS.filter(
    (section) => pathname === section.href || (section.href !== "/admin" && pathname.startsWith(`${section.href}/`))
  );
  return matches.sort((left, right) => right.href.length - left.href.length)[0] ?? null;
}

export function adminSection(href: string): AdminSection {
  const section = ADMIN_SECTIONS.find((entry) => entry.href === href);
  if (!section) throw new Error(`No admin section at ${href}`);
  return section;
}

/** A tab title: "Import jobs · Admin · Interior AI". */
export function adminTitle(pageTitle: string): string {
  return `${pageTitle} · Admin · Interior AI`;
}
