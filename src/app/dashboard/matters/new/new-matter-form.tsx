"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createMatterAction } from "@/app/dashboard/matters/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import { isNextRedirectError } from "@/lib/utils";
import type { MatterTypeT } from "@/types/database";

interface ClientOption {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface NewMatterFormProps {
  clients: ClientOption[];
}

export function NewMatterForm({ clients }: NewMatterFormProps) {
  const [pending, startTransition] = useTransition();
  const [clientMode, setClientMode] = useState<"existing" | "new">(clients.length > 0 ? "existing" : "new");
  const [matterType, setMatterType] = useState<MatterTypeT>("immigration");
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [contactPref, setContactPref] = useState<"email" | "sms" | "both">("email");

  function handleSubmit(formData: FormData) {
    formData.set("matter_type", matterType);
    formData.set("client_preferred_contact", contactPref);
    if (clientMode === "existing" && clientId) {
      formData.set("client_id", clientId);
    } else {
      formData.delete("client_id");
    }

    startTransition(async () => {
      try {
        await createMatterAction(formData);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Could not create matter");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="matter_name">Matter name</Label>
          <Input id="matter_name" name="matter_name" placeholder="e.g. Garcia I-130" required />
        </div>
        <div className="space-y-1.5">
          <Label>Matter type</Label>
          <Select value={matterType} onValueChange={(v) => setMatterType(v as MatterTypeT)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MATTER_TYPE_LABEL) as MatterTypeT[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {MATTER_TYPE_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="internal_reference">Internal reference (optional)</Label>
          <Input id="internal_reference" name="internal_reference" placeholder="Case number or matter code" />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Client</h3>
          <div className="flex gap-1 rounded-xl bg-card p-1 text-xs">
            <button
              type="button"
              onClick={() => setClientMode("existing")}
              disabled={clients.length === 0}
              className={`rounded-lg px-3 py-1.5 ${clientMode === "existing" ? "bg-secondary text-foreground" : "text-muted-foreground"} disabled:opacity-50`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setClientMode("new")}
              className={`rounded-lg px-3 py-1.5 ${clientMode === "new" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            >
              <Plus className="mr-1 inline h-3 w-3" /> New
            </button>
          </div>
        </div>

        {clientMode === "existing" ? (
          <div className="space-y-1.5">
            <Label>Choose client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} {c.email ? `· ${c.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client_full_name">Full name</Label>
              <Input id="client_full_name" name="client_full_name" placeholder="Maria Garcia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_email">Email</Label>
              <Input id="client_email" name="client_email" type="email" placeholder="maria@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_phone">Mobile (for SMS)</Label>
              <PhoneInput id="client_phone" name="client_phone" placeholder="555 555 1212" />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred contact</Label>
              <Select value={contactPref} onValueChange={(v) => setContactPref(v as typeof contactPref)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create matter
        </Button>
      </div>
    </form>
  );
}
