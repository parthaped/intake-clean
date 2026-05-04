"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createRequestAction } from "@/app/dashboard/matters/[matterId]/requests/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MatterTypeT } from "@/types/database";

interface ItemDraft {
  title: string;
  description: string;
  required: boolean;
}

interface TemplateOption {
  id: string;
  name: string;
  matter_type: MatterTypeT;
  items: ItemDraft[];
}

interface NewRequestFormProps {
  matterId: string;
  matterType: MatterTypeT;
  defaultTitle: string;
  templates: TemplateOption[];
}

const blank = (): ItemDraft => ({ title: "", description: "", required: true });

export function NewRequestForm({ matterId, matterType, defaultTitle, templates }: NewRequestFormProps) {
  const matchingTemplates = templates.filter((t) => t.matter_type === matterType);
  const initial = matchingTemplates[0] ?? templates[0] ?? null;

  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState<string>(initial?.id ?? "custom");
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.length ? initial.items.map((i) => ({ ...i })) : [blank()],
  );

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === "custom") {
      setItems([blank()]);
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setItems(tpl.items.map((i) => ({ ...i })));
  }

  function update(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function handleAction(formData: FormData) {
    const valid = items.filter((i) => i.title.trim().length > 0);
    if (valid.length === 0) {
      toast.error("Add at least one checklist item");
      return;
    }
    formData.set("matter_id", matterId);
    formData.set("template_id", templateId === "custom" ? "" : templateId);
    formData.set("items_json", JSON.stringify(valid));
    startTransition(async () => {
      try {
        await createRequestAction(formData);
        toast.success("Request created");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create request");
      }
    });
  }

  return (
    <form action={handleAction} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Request title</Label>
          <Input id="title" name="title" defaultValue={defaultTitle} required />
        </div>
        <div className="space-y-1.5">
          <Label>Start from template</Label>
          <Select value={templateId} onValueChange={applyTemplate}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom checklist</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="message_to_client">Message to client (optional)</Label>
          <Textarea
            id="message_to_client"
            name="message_to_client"
            placeholder="Add a short note. Plain English works best."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expires_at">Expires (optional)</Label>
          <Input id="expires_at" name="expires_at" type="date" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Checklist items</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setItems((p) => [...p, blank()])}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_auto] items-start gap-3 rounded-2xl border border-border bg-secondary/30 p-3"
            >
              <div className="space-y-2">
                <Input
                  value={item.title}
                  onChange={(e) => update(idx, { title: e.target.value })}
                  placeholder="e.g. Government ID"
                />
                <Textarea
                  value={item.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  placeholder="Description shown to the client (optional)"
                  className="min-h-[60px]"
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={item.required} onCheckedChange={(v) => update(idx, { required: !!v })} />
                  Required
                </label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create request
        </Button>
      </div>
    </form>
  );
}
