"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REUPLOAD_REASONS } from "@/lib/constants";

interface ReuploadReasonDialogProps {
  fileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function ReuploadReasonDialog({ fileId, open, onOpenChange, onComplete }: ReuploadReasonDialogProps) {
  const [reason, setReason] = useState<string>(REUPLOAD_REASONS[0]);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (reason.trim().length < 5) {
      toast.error("Add a short reason for the client.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/files/${fileId}/request-reupload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Could not request re-upload");
        return;
      }
      toast.success("Re-upload requested");
      onComplete?.();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a re-upload</DialogTitle>
          <DialogDescription>
            Pick a preset or write your own reason. The client will see this in plain English.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REUPLOAD_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  preset === reason ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Message to client</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[110px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Send re-upload request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
