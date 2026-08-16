"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icon";

const primaryNavigation: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/patients", label: "Patients", icon: "patients" },
  { href: "/clinical", label: "Clinical", icon: "clipboard" },
  { href: "/billing", label: "Billing", icon: "card" },
  { href: "/reports", label: "Reports", icon: "chart" },
];

const secondaryNavigation: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/notifications", label: "Notifications", icon: "bell" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/help", label: "Help", icon: "help" },
];

function ToothMark() {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className="tooth-mark">
      <path d="M10.3 5.5c2.1 0 4 1.2 7.7 1.2s5.6-1.2 7.7-1.2c4 0 6.8 3.4 6.1 8-.7 4.6-3.1 7.2-4.4 11.7-.8 2.9-1.7 5.4-3.9 5.4-2.5 0-2.4-7.4-5.5-7.4s-3 7.4-5.5 7.4c-2.2 0-3.1-2.5-3.9-5.4-1.3-4.5-3.7-7.1-4.4-11.7-.7-4.6 2.1-8 6.1-8Z" />
    </svg>
  );
}

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(true);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const syncViewport = () => {
      setIsNarrowViewport(mediaQuery.matches);
      if (!mediaQuery.matches) setMobileOpen(false);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isNarrowViewport || !mobileOpen) return;
    navigationRef.current?.querySelector<HTMLAnchorElement>(".app-nav-link")?.focus();
  }, [isNarrowViewport, mobileOpen]);

  const closeMobileNavigation = () => {
    setMobileOpen(false);
    window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  };

  const navigationHidden = isNarrowViewport && !mobileOpen;

  const renderLinks = (items: typeof primaryNavigation) =>
    items.map((item) => {
      const active = pathname === item.href;
      return (
        <Link
          key={item.href}
          href={item.href}
          className="app-nav-link"
          data-active={active ? "true" : "false"}
          data-label={item.label}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          onClick={() => setMobileOpen(false)}
        >
          <span className="app-nav-link-content">
            <Icon name={item.icon} />
            <span className="app-nav-label">{item.label}</span>
          </span>
          <span className="app-nav-tooltip" aria-hidden="true">{item.label}</span>
        </Link>
      );
    });

  return (
    <div className="app-shell" data-nav-collapsed={desktopCollapsed ? "true" : "false"}>
      <header className="mobile-header">
        <button
          ref={mobileMenuButtonRef}
          type="button"
          className="icon-button mobile-menu-button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls="workspace-navigation"
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Icon name={mobileOpen ? "close" : "menu"} />
        </button>
        <div className="mobile-brand"><ToothMark /><span>Brightview Dental</span></div>
        <button type="button" className="avatar-button" aria-label="Open account menu">MP</button>
      </header>

      <aside
        ref={navigationRef}
        id="workspace-navigation"
        className="app-nav"
        data-open={mobileOpen ? "true" : "false"}
        data-collapsed={desktopCollapsed ? "true" : "false"}
        aria-hidden={navigationHidden ? true : undefined}
        inert={navigationHidden || undefined}
      >
        <div className="brand-block">
          <ToothMark />
          <div className="brand-copy">
            <strong>Brightview</strong>
            <span>Dental · Demo practice</span>
          </div>
          <button
            type="button"
            className="nav-collapse-button"
            aria-label={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!desktopCollapsed}
            onClick={() => setDesktopCollapsed((collapsed) => !collapsed)}
          >
            <Icon name="chevron-left" size={16} />
          </button>
        </div>
        <nav aria-label="Primary navigation" className="app-nav-section">
          {renderLinks(primaryNavigation)}
        </nav>
        <nav aria-label="Support navigation" className="app-nav-section app-nav-secondary">
          {renderLinks(secondaryNavigation)}
        </nav>
        <button type="button" className="account-block" data-label="Maya Patel" aria-label="Open account menu for Maya Patel">
          <span className="account-avatar">MP</span>
          <span className="account-copy"><strong>Maya Patel</strong><small>Receptionist</small></span>
          <Icon name="more" size={16} />
          <span className="app-nav-tooltip" aria-hidden="true">Maya Patel</span>
        </button>
      </aside>
      {mobileOpen ? <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={closeMobileNavigation} /> : null}
      <main className="workspace-main">{children}</main>
    </div>
  );
}
