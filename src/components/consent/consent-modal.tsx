"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
import { Separator } from "@/components/ui/separator";
import { useConsent } from "@/lib/consent/client";
import type { ConsentRecord } from "@/lib/consent/types";

/**
 * Granular per-category consent settings. Reachable from the banner's
 * "Customize" button and the footer "Cookie preferences" link.
 */
export function ConsentModal() {
  const { modalOpen, closeModal, categories, save } = useConsent();

  const [functional, setFunctional] = useState<boolean>(categories.functional);
  const [analytics, setAnalytics] = useState<boolean>(categories.analytics);

  // Keep local checkbox state in sync with the persisted record whenever
  // the modal re-opens — otherwise revisiting after a save would briefly
  // show the previous draft.
  useEffect(() => {
    if (modalOpen) {
      setFunctional(categories.functional);
      setAnalytics(categories.analytics);
    }
  }, [modalOpen, categories.functional, categories.analytics]);

  const handleSave = () => {
    save(
      { necessary: true, functional, analytics },
      "modal_save",
    );
  };

  const handleRejectAll = () => {
    const next: ConsentRecord["categories"] = {
      necessary: true,
      functional: false,
      analytics: false,
    };
    setFunctional(false);
    setAnalytics(false);
    save(next, "modal_save");
  };

  const handleAcceptAll = () => {
    const next: ConsentRecord["categories"] = {
      necessary: true,
      functional: true,
      analytics: true,
    };
    setFunctional(true);
    setAnalytics(true);
    save(next, "modal_save");
  };

  return (
    <Dialog open={modalOpen} onOpenChange={(o) => (o ? null : closeModal())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cookie preferences</DialogTitle>
          <DialogDescription>
            IntakeClean does not run cross-site advertising. Choose which optional
            cookies you allow. See the{" "}
            <Link className="underline underline-offset-2" href="/legal/cookie-notice">
              Cookie Notice
            </Link>{" "}
            for the full list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <CategoryRow
            id="cat-necessary"
            title="Strictly necessary"
            description="Authentication, session integrity, and security cookies. These cannot be disabled because the product will not function without them."
            checked
            disabled
            onChange={() => undefined}
          />
          <Separator />
          <CategoryRow
            id="cat-functional"
            title="Functional"
            description="Remembers preferences like your theme and sidebar state so you don't have to set them again on every visit."
            checked={functional}
            onChange={setFunctional}
          />
          <Separator />
          <CategoryRow
            id="cat-analytics"
            title="Analytics"
            description="Aggregated, privacy-preserving usage analytics so we can prioritise improvements. Off by default. No analytics provider is enabled today."
            checked={analytics}
            onChange={setAnalytics}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleRejectAll}>
            Reject all
          </Button>
          <Button variant="outline" onClick={handleAcceptAll}>
            Accept all
          </Button>
          <Button onClick={handleSave}>Save preferences</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CategoryRowProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function CategoryRow({ id, title, description, checked, disabled, onChange }: CategoryRowProps) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-1"
      />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-semibold">
          {title}
          {disabled ? <span className="ml-2 text-xs text-muted-foreground">Always on</span> : null}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
