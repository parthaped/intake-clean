"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/utils";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface TopbarProps {
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
}

export function Topbar({ user, organization }: TopbarProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
      <div className="hidden flex-1 max-w-md md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search matters, clients, or documents…" className="pl-9" />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-sm font-medium text-foreground">{organization.name}</span>
          <Badge variant="outline" className="capitalize">
            {organization.plan}
          </Badge>
          {organization.subscriptionStatus !== "active" && (
            <Badge variant="warning" className="capitalize">
              {organization.subscriptionStatus.replaceAll("_", " ")}
            </Badge>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar>
                <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{user.fullName}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
                <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{user.role}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">Firm settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/billing">Billing</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
