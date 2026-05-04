"use client";

import { useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface SendRequestButtonProps {
  requestId: string;
  status: string;
  variant?: "default" | "outline";
  label?: string;
}

export function SendRequestButton({
  requestId,
  status,
  variant = "outline",
  label = status === "draft" ? "Send to client" : "Resend",
}: SendRequestButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const path = status === "draft" ? "send" : "remind";
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/${path}`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        toast.error(text || "Could not send request");
        return;
      }
      toast.success(path === "remind" ? "Reminder sent" : "Request sent");
    });
  }

  return (
    <Button type="button" size="sm" variant={variant} onClick={handleClick} disabled={pending}>
      <Send className="h-4 w-4" /> {label}
    </Button>
  );
}
