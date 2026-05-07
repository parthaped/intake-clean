"use client";

import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface Props {
  matterId: string;
}

interface SendApiResponse {
  ok?: boolean;
  status?: "sent" | "sent_mock" | "failed" | string;
  emailError?: string | null;
  smsError?: string | null;
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
      // Match SendRequestButton's status-aware toasts so a misconfigured
      // Resend key (mock fallback) or a provider rejection on the completion
      // notification can't masquerade as a successful send.
      const body = (await res.json().catch(() => ({}))) as SendApiResponse;
      const channelError = body.emailError ?? body.smsError ?? null;
      switch (body.status) {
        case "sent":
          toast.success("Completion message sent to client");
          return;
        case "sent_mock":
          toast.warning(
            "Completion message recorded in mock mode — set RESEND_API_KEY (and a verified RESEND_FROM_EMAIL) to actually deliver email.",
          );
          return;
        case "failed":
          toast.error(
            channelError
              ? `Completion message could not be delivered: ${channelError}`
              : "Completion message could not be delivered. See the Messages tab for details.",
          );
          return;
        default:
          toast.success("Completion message sent");
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      <CheckCircle2 className="h-4 w-4" /> Send completion thank-you
    </Button>
  );
}
