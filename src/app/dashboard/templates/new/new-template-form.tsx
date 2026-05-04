"use client";

import { useState, useTransition } from "react";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createTemplateAction } from "@/app/dashboard/templates/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import type { MatterTypeT } from "@/types/database";

interface ItemDraft {
  title: string;
  description: string;
  required: boolean;
}

const emptyItem = (): ItemDraft => ({ title: "", description: "", required: true });

export function NewTemplateForm() {
  const [pending, startTransition] = useTransition();
  const [matterType, setMatterType] = useState<MatterTypeT>("immigration");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem(), emptyItem()]);

  function update(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function handleAction(formData: FormData) {
    const valid = items.filter((i) => i.title.trim().length > 0);
    if (valid.length === 0) {
      toast.error("Add at least one checklist item");
      return;
    }
    formData.set("matter_type", matterType);
    formData.set("items_json", JSON.stringify(valid));
    startTransition(async () => {
      try {
        await createTemplateAction(formData);
        toast.success("Template created");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create template");
      }
    });
  }

  return (
    <form action={handleAction} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="e.g. Marriage-based green card intake" required />
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
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" placeholder="Optional notes for staff" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Checklist items</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border border-border bg-secondary/30 p-3">
              <span className="mt-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
              </span>
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
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create template
        </Button>
      </div>
    </form>
  );
}
