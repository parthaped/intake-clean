"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
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

interface ReuploadPreset {
  id: string;
  label: string;
  text: string;
}

interface ReuploadReasonDialogProps {
  fileId: string;
  presets: ReuploadPreset[];
  defaultReason?: string;
  defaultPresetId?: string;
  canRewriteWithHF: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

/**
 * Dialog for staff to send a re-upload request. Presets come from the local
 * rules engine; the staff can edit them, optionally ask HF to rewrite, and
 * always have the final word before sending.
 */
export function ReuploadReasonDialog({
  fileId,
  presets,
  defaultReason,
  defaultPresetId,
  canRewriteWithHF,
  open,
  onOpenChange,
  onComplete,
}: ReuploadReasonDialogProps) {
  const initial = useMemo(
    () => defaultReason ?? presets.find((p) => p.id === defaultPresetId)?.text ?? presets[0]?.text ?? "",
    [defaultReason, defaultPresetId, presets],
  );
  const [reason, setReason] = useState<string>(initial);
  const [activePresetId, setActivePresetId] = useState<string | undefined>(defaultPresetId);
  const [pending, startTransition] = useTransition();
  const [rewriting, startRewrite] = useTransition();

  useEffect(() => {
    if (open) {
      setReason(initial);
      setActivePresetId(defaultPresetId);
    }
  }, [open, initial, defaultPresetId]);

  function pickPreset(preset: ReuploadPreset) {
    setActivePresetId(preset.id);
    setReason(preset.text);
  }

  function rewriteWithHF() {
    startRewrite(async () => {
      const res = await fetch(`/api/files/${fileId}/rewrite-reason`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: activePresetId, reason }),
      });
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || "Could not rewrite with AI");
        return;
      }
      const data = (await res.json()) as { text?: string };
      if (data.text) {
        setReason(data.text);
        toast.success("Rewritten with AI. Please review before sending.");
      }
    });
  }

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
            Pick a preset or write your own reason. The client will see this in plain English. AI checks are
            assistive only — please review every word before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => pickPreset(preset)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  preset.id === activePresetId
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Message to client</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[110px]" />
          </div>
          {canRewriteWithHF && (
            <Button type="button" variant="ghost" size="sm" onClick={rewriteWithHF} disabled={rewriting}>
              {rewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Rewrite with AI
            </Button>
          )}
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
