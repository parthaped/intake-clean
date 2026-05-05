"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { ReuploadReasonDialog } from "@/components/reupload-reason-dialog";
import { Button } from "@/components/ui/button";

interface ReuploadPreset {
  id: string;
  label: string;
  text: string;
}

interface ReviewActionBarProps {
  fileId: string;
  presets: ReuploadPreset[];
  defaultReason?: string;
  defaultPresetId?: string;
  canRewriteWithHF: boolean;
  onActionComplete?: () => void;
}

export function ReviewActionBar({
  fileId,
  presets,
  defaultReason,
  defaultPresetId,
  canRewriteWithHF,
  onActionComplete,
}: ReviewActionBarProps) {
  const [pending, startTransition] = useTransition();
  const [reuploadOpen, setReuploadOpen] = useState(false);

  function submit(action: "accept" | "reject") {
    startTransition(async () => {
      const res = await fetch(`/api/files/${fileId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Action failed");
        return;
      }
      toast.success(action === "accept" ? "Accepted into packet" : "Rejected");
      onActionComplete?.();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => submit("accept")} disabled={pending} variant="default">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
        </Button>
        <Button onClick={() => setReuploadOpen(true)} disabled={pending} variant="outline">
          <RotateCcw className="h-4 w-4" /> Request re-upload
        </Button>
        <Button onClick={() => submit("reject")} disabled={pending} variant="ghost" className="text-destructive">
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>

      <ReuploadReasonDialog
        fileId={fileId}
        presets={presets}
        defaultReason={defaultReason}
        defaultPresetId={defaultPresetId}
        canRewriteWithHF={canRewriteWithHF}
        open={reuploadOpen}
        onOpenChange={setReuploadOpen}
        onComplete={onActionComplete}
      />
    </>
  );
}
