"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function RunJobsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await fetch("/api/process/run", { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        toast.error(text || "Could not run pending jobs");
        return;
      }
      const data = (await res.json()) as { processed?: number };
      toast.success(`Drained ${data.processed ?? 0} processing job${data.processed === 1 ? "" : "s"}`);
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Run pending jobs
    </Button>
  );
}
