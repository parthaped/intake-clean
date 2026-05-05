"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  CreditCard,
  FilePlus2,
  FolderKanban,
  History,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCheck,
  Wrench,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/dashboard/matters", label: "Matters", Icon: FolderKanban },
  { href: "/dashboard/review", label: "Review queue", Icon: ShieldCheck },
  { href: "/dashboard/templates", label: "Templates", Icon: ClipboardList },
  { href: "/dashboard/audit-log", label: "Audit log", Icon: History },
  { href: "/dashboard/security/access-review", label: "Access review", Icon: UserCheck },
  { href: "/dashboard/security/mfa", label: "Security", Icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", Icon: Settings },
  { href: "/dashboard/billing", label: "Billing", Icon: CreditCard },
];

interface SidebarNavProps {
  showAdminDebug?: boolean;
}

export function SidebarNav({ showAdminDebug = false }: SidebarNavProps) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/60 p-4 lg:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 py-2">
        <BrandMark />
      </Link>
      <Link
        href="/dashboard/matters/new"
        className="mb-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
      >
        <FilePlus2 className="h-4 w-4" /> Create matter
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-muted-foreground")} />
              <span>{label}</span>
            </Link>
          );
        })}
        {showAdminDebug && (
          <Link
            href="/admin/dev"
            className={cn(
              "mt-4 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium",
              pathname.startsWith("/admin/dev")
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Wrench className="h-4 w-4" />
            <span>Dev tools</span>
          </Link>
        )}
      </nav>
      <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
        IntakeClean helps organize documents and does not provide legal advice.
      </p>
    </aside>
  );
}
