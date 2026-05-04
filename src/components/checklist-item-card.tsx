import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import type { RequestItemStatus } from "@/types/database";

interface ChecklistItemCardProps {
  title: string;
  description: string | null;
  status: RequestItemStatus;
  required: boolean;
}

export function ChecklistItemCard({ title, description, status, required }: ChecklistItemCardProps) {
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {title}
          {required ? <span className="ml-1 text-xs text-muted-foreground">· required</span> : null}
        </p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <StatusBadge kind="request-item" status={status} />
    </Card>
  );
}
