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

interface SendApiResponse {
  ok?: boolean;
  status?: "sent" | "sent_mock" | "failed" | string;
  emailError?: string | null;
  smsError?: string | null;
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
    const initialVerb = path === "remind" ? "Reminder" : "Request";
    startTransition(async () => {
      const res = await fetch(`/api/requests/${requestId}/${path}`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        toast.error(text || `Could not send ${initialVerb.toLowerCase()}`);
        return;
      }
      // Read the structured per-channel status so a `sent_mock` (no Resend
      // key configured) or `failed` (provider rejected) outcome is shown
      // honestly instead of pretending the email went out.
      const body = (await res.json().catch(() => ({}))) as SendApiResponse;
      const channelError = body.emailError ?? body.smsError ?? null;
      switch (body.status) {
        case "sent":
          toast.success(`${initialVerb} sent to client`);
          return;
        case "sent_mock":
          toast.warning(
            `${initialVerb} recorded in mock mode — set RESEND_API_KEY (and a verified RESEND_FROM_EMAIL) to actually deliver email.`,
          );
          return;
        case "failed":
          toast.error(
            channelError
              ? `${initialVerb} could not be delivered: ${channelError}`
              : `${initialVerb} could not be delivered. See the Messages tab for details.`,
          );
          return;
        default:
          toast.success(`${initialVerb} sent`);
      }
    });
  }

  return (
    <Button type="button" size="sm" variant={variant} onClick={handleClick} disabled={pending}>
      <Send className="h-4 w-4" /> {label}
    </Button>
  );
}
