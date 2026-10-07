"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  RefreshCw,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FinalNavigationItem } from "@/constants/final-navigation";

const ICON_BY_HREF: Record<FinalNavigationItem["href"], LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/devoluciones": RefreshCw,
  "/reportes-carga": Truck,
  "/usuarios": Users,
};

export function TopNavigation({
  links,
}: {
  links: readonly FinalNavigationItem[];
}) {
  const pathname = usePathname();

  const items = links.map((link) => {
    const active =
      pathname === link.href ||
      (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));

    const Icon = ICON_BY_HREF[link.href];

    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={`dx-top-link dx-top-link-premium${active ? " active" : ""}`}
      >
        <span className="dx-top-icon" aria-hidden="true">
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <strong>{link.label}</strong>
        <i className="dx-top-active-line" aria-hidden="true" />
      </Link>
    );
  });

  return (
    <>
      <nav
        className="dx-top-links dx-top-links-desktop"
        aria-label="Navegacion principal"
      >
        {items}
      </nav>

      <details className="dx-mobile-nav">
        <summary>
          <span>Menu</span>
          <i aria-hidden="true" />
        </summary>
        <nav aria-label="Navegacion principal movil">{items}</nav>
      </details>
    </>
  );
}