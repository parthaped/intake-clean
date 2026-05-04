import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  trend?: string;
  intent?: "default" | "warning" | "destructive" | "success" | "info";
  className?: string;
}

const intentClasses: Record<NonNullable<StatCardProps["intent"]>, string> = {
  default: "bg-secondary/60 text-foreground",
  info: "bg-info/10 text-info",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
};

export function StatCard({ label, value, Icon, trend, intent = "default", className }: StatCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex items-start justify-between p-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            intentClasses[intent],
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}
