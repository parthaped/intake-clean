import Link from "next/link";
import { ArrowRight, User } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import type { MatterStatus, MatterTypeT } from "@/types/database";
import { relativeTime } from "@/lib/utils";

interface MatterCardProps {
  id: string;
  matterName: string;
  clientName: string;
  matterType: MatterTypeT;
  status: MatterStatus;
  internalReference: string | null;
  updatedAt: string;
}

export function MatterCard({ id, matterName, clientName, matterType, status, internalReference, updatedAt }: MatterCardProps) {
  return (
    <Link href={`/dashboard/matters/${id}`} className="group">
      <Card className="h-full p-5 transition hover:border-accent">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {MATTER_TYPE_LABEL[matterType]}
              {internalReference && <span className="ml-2">· #{internalReference}</span>}
            </p>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{matterName}</h3>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" /> {clientName}
            </p>
          </div>
          <StatusBadge kind="matter" status={status} />
        </div>
        <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Updated {relativeTime(updatedAt)}</span>
          <span className="flex items-center gap-1 text-foreground transition group-hover:translate-x-0.5 group-hover:text-accent">
            Open <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
