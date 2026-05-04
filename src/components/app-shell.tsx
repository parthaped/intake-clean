import type { ReactNode } from "react";

import { SidebarNav } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { env } from "@/lib/env";

interface AppShellProps {
  user: {
    fullName: string;
    email: string | null;
    role: string;
  };
  organization: {
    name: string;
    plan: string;
    subscriptionStatus: string;
  };
  children: ReactNode;
}

export function AppShell({ user, organization, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <SidebarNav showAdminDebug={env.adminDebug && user.role === "admin"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} organization={organization} />
        <main className="flex-1 overflow-x-hidden px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
