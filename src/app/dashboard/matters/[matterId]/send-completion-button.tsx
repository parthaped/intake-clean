"use client";

import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface Props {
  matterId: string;
}

export function SendCompletionButton({ matterId }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await fetch(`/api/matters/${matterId}/send-completion`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        toast.error(text || "Could not send completion message");
        return;
      }
      toast.success("Completion message sent");
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      <CheckCircle2 className="h-4 w-4" /> Send completion thank-you
    </Button>
  );
}
