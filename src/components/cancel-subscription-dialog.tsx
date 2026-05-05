"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CANCELLATION_REASONS } from "@/lib/constants";
import {
  cancelSubscriptionAction,
  type CancelSubscriptionResult,
} from "@/app/dashboard/billing/billing-actions";

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: (result: CancelSubscriptionResult) => void;
}

const COMMENT_MAX_LENGTH = 2_000;

function formatAccessEndsAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Exit-survey + confirmation dialog. The reasons (multi-select) and the
 * free-text comment are both optional, matching the user's request:
 * "if they do not have anything they want to describe about their specific
 * issue allow them to continue to cancel anyway."
 */
export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  onCancelled,
}: CancelSubscriptionDialogProps) {
  const [reasonIds, setReasonIds] = useState<Set<string>>(() => new Set());
  const [comment, setComment] = useState<string>("");
  const [pending, startTransition] = useTransition();

  // Reset state every time the dialog re-opens so a previous cancel attempt
  // doesn't leave stale checkboxes ticked.
  useEffect(() => {
    if (!open) return;
    setReasonIds(new Set());
    setComment("");
  }, [open]);

  function toggleReason(id: string, checked: boolean) {
    setReasonIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await cancelSubscriptionAction({
        reasons: Array.from(reasonIds),
        comment: comment.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const ends = formatAccessEndsAt(result.accessEndsAt);
      toast.success("Subscription cancelled", {
        description: ends
          ? `No further charges. You'll keep full access until ${ends}.`
          : "No further charges. You'll keep full access until the end of the current period.",
      });
      onCancelled?.(result);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            We&apos;ll stop the next payment immediately. You&apos;ll keep full access to
            IntakeClean until the end of the current billing period — no rush to
            move your matters or exports out today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                What&apos;s driving the cancellation?
              </Label>
              <p className="text-xs text-muted-foreground">
                Select any that apply. This is optional and stays internal — it
                helps us prioritise what to ship next.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CANCELLATION_REASONS.map((reason) => {
                const inputId = `cancel-reason-${reason.id}`;
                return (
                  <label
                    key={reason.id}
                    htmlFor={inputId}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-sm transition hover:border-foreground/40"
                  >
                    <Checkbox
                      id={inputId}
                      checked={reasonIds.has(reason.id)}
                      onCheckedChange={(value) =>
                        toggleReason(reason.id, value === true)
                      }
                      disabled={pending}
                    />
                    <span>{reason.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-comment" className="text-sm font-medium">
              Anything specific you&apos;d like us to know? (optional)
            </Label>
            <Textarea
              id="cancel-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
              placeholder="A workflow that didn't fit, a feature you needed, a billing question — anything goes."
              className="min-h-[110px]"
              maxLength={COMMENT_MAX_LENGTH}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              You can leave this blank and continue to cancel.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Keep subscription
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancel subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
