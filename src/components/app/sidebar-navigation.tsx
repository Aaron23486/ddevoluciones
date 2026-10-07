"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SidebarLink = {
  href: string;
  label: string;
  short: string;
};

export function SidebarNavigation({
  links,
}: {
  links: readonly SidebarLink[];
}) {
  const pathname = usePathname();

  return (
    <nav className="dv-sidebar-menu" aria-label="Navegacion principal">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`dv-sidebar-link${active ? " active" : ""}`}
          >
            <span className="dv-sidebar-icon" aria-hidden="true">
              {link.short}
            </span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}