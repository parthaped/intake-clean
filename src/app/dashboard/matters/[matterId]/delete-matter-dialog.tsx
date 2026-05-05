"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteMatterAction } from "@/app/dashboard/matters/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNextRedirectError } from "@/lib/utils";

interface Props {
  matterId: string;
  matterName: string;
  fileCount: number;
  exportCount: number;
}

/**
 * Permanent-delete dialog. Mirrors the GitHub / Stripe "type the name to
 * confirm" pattern so a misclick can't wipe a year of intake. The server
 * action additionally gates on `admin` role + fresh MFA, so this UI is just
 * the last line of defense.
 */
export function DeleteMatterDialog({ matterId, matterName, fileCount, exportCount }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  const canDelete = confirmText.trim().toLowerCase() === matterName.trim().toLowerCase();

  function handleDelete() {
    if (!canDelete) return;
    const formData = new FormData();
    formData.set("matter_id", matterId);
    formData.set("confirm_name", confirmText);

    startTransition(async () => {
      try {
        await deleteMatterAction(formData);
      } catch (err) {
        // Next.js redirect throws a NEXT_REDIRECT digest error on success;
        // surface it to the framework instead of treating it as a failure.
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Could not delete matter");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" /> Delete matter…
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permanently delete this matter?</DialogTitle>
          <DialogDescription>
            This removes the matter and every linked record from IntakeClean and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">The following will be deleted:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>The matter record and its activity history</li>
            <li>All document requests, checklist items, and client messages</li>
            <li>
              {fileCount} uploaded {fileCount === 1 ? "file" : "files"} (originals, processed copies, thumbnails)
            </li>
            <li>
              {exportCount} generated {exportCount === 1 ? "export" : "exports"} (PDF packets, ZIPs, missing-doc reports)
            </li>
            <li>All review tasks and AI quality checks</li>
          </ul>
          <p className="text-muted-foreground">
            The client record itself is preserved; their other matters (if any) are not affected.
          </p>
          <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            Verify with your firm&apos;s file-retention policy before proceeding. Some jurisdictions require client files
            to be retained for years after a matter closes.
          </p>

          <div className="space-y-2 pt-1">
            <Label htmlFor="confirm-name" className="text-foreground">
              Type <span className="font-mono text-foreground">{matterName}</span> to confirm
            </Label>
            <Input
              id="confirm-name"
              autoComplete="off"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={matterName}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || pending}
          >
            {pending ? "Deleting…" : "Delete matter permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
