import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { MatterTypeT } from "@/types/database";

import { TemplateCard, type TemplateCardItem } from "./template-card";

interface TemplateRow {
  id: string;
  name: string;
  matter_type: MatterTypeT;
  description: string | null;
  is_global: boolean;
  organization_id: string | null;
  created_at: string;
  checklist_template_items: TemplateCardItem[];
}

export default async function TemplatesPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();

  const templatesRes = await service
    .from("checklist_templates")
    .select(
      "id, name, matter_type, description, is_global, organization_id, created_at, checklist_template_items(id, title, description, required, sort_order)",
    )
    .or(`organization_id.eq.${ctx.organization.id},is_global.eq.true`)
    .order("name", { ascending: true });
  const rawTemplates = (templatesRes.data ?? []) as TemplateRow[];

  // Deduplicate by (matter_type, name): onboarding copies global templates
  // into each org as is_global=false rows, so the same template would
  // otherwise appear twice. Prefer the org-owned copy when both exist so
  // any local edits/customizations are reflected.
  const dedupedByKey = new Map<string, TemplateRow>();
  for (const tpl of rawTemplates) {
    const key = `${tpl.matter_type}::${tpl.name.trim().toLowerCase()}`;
    const existing = dedupedByKey.get(key);
    if (!existing) {
      dedupedByKey.set(key, tpl);
      continue;
    }
    const existingIsOrgOwned = existing.organization_id === ctx.organization.id;
    const candidateIsOrgOwned = tpl.organization_id === ctx.organization.id;
    if (candidateIsOrgOwned && !existingIsOrgOwned) {
      dedupedByKey.set(key, tpl);
    }
  }
  const templates = Array.from(dedupedByKey.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Checklist templates</h1>
          <p className="text-muted-foreground">Reusable document checklists for each matter type.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/templates/new">New template</Link>
        </Button>
      </div>

      {templates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => {
            const sortedItems = [...tpl.checklist_template_items].sort(
              (a, b) => a.sort_order - b.sort_order,
            );
            return (
              <TemplateCard
                key={tpl.id}
                id={tpl.id}
                name={tpl.name}
                matter_type={tpl.matter_type}
                description={tpl.description}
                is_global={tpl.is_global}
                items={sortedItems}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          Icon={ClipboardList}
          title="No templates yet"
          description="Create a checklist template for the matter types you handle most."
          action={
            <Button asChild>
              <Link href="/dashboard/templates/new">New template</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
