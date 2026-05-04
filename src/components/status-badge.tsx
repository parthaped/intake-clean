import {
  CheckCircle2,
  Clock,
  FileWarning,
  Inbox,
  Loader2,
  PauseCircle,
  ShieldCheck,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FILE_STATUS_LABEL,
  JOB_STATUS_LABEL,
  MATTER_STATUS_LABEL,
  REQUEST_ITEM_STATUS_LABEL,
  REQUEST_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
} from "@/lib/constants";
import type {
  JobStatus,
  MatterStatus,
  RequestItemStatus,
  RequestStatus,
  ReviewStatus,
  UploadedFileStatus,
} from "@/types/database";

type StatusKind = "matter" | "request" | "request-item" | "file" | "review" | "job";

interface StatusBadgeProps {
  kind: StatusKind;
  status: string;
  className?: string;
}

interface StatusVisual {
  variant: BadgeProps["variant"];
  Icon: LucideIcon;
  label: string;
}

function visualFor(kind: StatusKind, status: string): StatusVisual {
  switch (kind) {
    case "matter": {
      const labels = MATTER_STATUS_LABEL;
      const map: Record<MatterStatus, StatusVisual> = {
        active: { variant: "info", Icon: Sparkles, label: labels.active },
        waiting_on_client: { variant: "warning", Icon: Clock, label: labels.waiting_on_client },
        in_review: { variant: "primary", Icon: Inbox, label: labels.in_review },
        ready_to_export: { variant: "accent", Icon: ShieldCheck, label: labels.ready_to_export },
        completed: { variant: "success", Icon: CheckCircle2, label: labels.completed },
        archived: { variant: "outline", Icon: PauseCircle, label: labels.archived },
      };
      return map[status as MatterStatus] ?? { variant: "default", Icon: Inbox, label: status };
    }
    case "request": {
      const labels = REQUEST_STATUS_LABEL;
      const map: Record<RequestStatus, StatusVisual> = {
        draft: { variant: "outline", Icon: PauseCircle, label: labels.draft },
        sent: { variant: "info", Icon: Clock, label: labels.sent },
        partially_complete: { variant: "warning", Icon: Clock, label: labels.partially_complete },
        submitted: { variant: "success", Icon: CheckCircle2, label: labels.submitted },
        closed: { variant: "outline", Icon: PauseCircle, label: labels.closed },
        expired: { variant: "destructive", Icon: XCircle, label: labels.expired },
      };
      return map[status as RequestStatus] ?? { variant: "default", Icon: Inbox, label: status };
    }
    case "request-item": {
      const labels = REQUEST_ITEM_STATUS_LABEL;
      const map: Record<RequestItemStatus, StatusVisual> = {
        missing: { variant: "outline", Icon: Clock, label: labels.missing },
        uploaded: { variant: "info", Icon: Inbox, label: labels.uploaded },
        needs_reupload: { variant: "destructive", Icon: FileWarning, label: labels.needs_reupload },
        accepted: { variant: "success", Icon: CheckCircle2, label: labels.accepted },
        waived: { variant: "outline", Icon: PauseCircle, label: labels.waived },
      };
      return map[status as RequestItemStatus] ?? { variant: "default", Icon: Inbox, label: status };
    }
    case "file": {
      const labels = FILE_STATUS_LABEL;
      const map: Record<UploadedFileStatus, StatusVisual> = {
        uploaded: { variant: "info", Icon: Inbox, label: labels.uploaded },
        processing: { variant: "warning", Icon: Loader2, label: labels.processing },
        needs_review: { variant: "primary", Icon: Inbox, label: labels.needs_review },
        needs_reupload: { variant: "destructive", Icon: FileWarning, label: labels.needs_reupload },
        accepted: { variant: "success", Icon: CheckCircle2, label: labels.accepted },
        rejected: { variant: "destructive", Icon: XCircle, label: labels.rejected },
        exported: { variant: "accent", Icon: ShieldCheck, label: labels.exported },
      };
      return map[status as UploadedFileStatus] ?? { variant: "default", Icon: Inbox, label: status };
    }
    case "review": {
      const labels = REVIEW_STATUS_LABEL;
      const map: Record<ReviewStatus, StatusVisual> = {
        open: { variant: "info", Icon: Inbox, label: labels.open },
        accepted: { variant: "success", Icon: CheckCircle2, label: labels.accepted },
        rejected: { variant: "destructive", Icon: XCircle, label: labels.rejected },
        requested_reupload: { variant: "warning", Icon: FileWarning, label: labels.requested_reupload },
      };
      return map[status as ReviewStatus] ?? { variant: "default", Icon: Inbox, label: status };
    }
    case "job": {
      const labels = JOB_STATUS_LABEL;
      const map: Record<JobStatus, StatusVisual> = {
        queued: { variant: "outline", Icon: Clock, label: labels.queued },
        running: { variant: "info", Icon: Loader2, label: labels.running },
        completed: { variant: "success", Icon: CheckCircle2, label: labels.completed },
        failed: { variant: "destructive", Icon: XCircle, label: labels.failed },
      };
      return map[status as JobStatus] ?? { variant: "default", Icon: Inbox, label: status };
    }
    default:
      return { variant: "default", Icon: Inbox, label: status };
  }
}

export function StatusBadge({ kind, status, className }: StatusBadgeProps) {
  const { variant, Icon, label } = visualFor(kind, status);
  const animated = (kind === "file" && status === "processing") || (kind === "job" && status === "running");
  return (
    <Badge variant={variant} className={cn("gap-1.5 pl-1.5 pr-2 py-1", className)}>
      <Icon className={cn("h-3.5 w-3.5", animated && "animate-spin")} />
      <span>{label}</span>
    </Badge>
  );
}
