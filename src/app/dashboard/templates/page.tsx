import Link from "next/link";
import { ClipboardList, FileBadge } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function TemplatesPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();

  type TemplateRow = {
    id: string;
    name: string;
    matter_type: import("@/types/database").MatterTypeT;
    description: string | null;
    is_global: boolean;
    created_at: string;
    checklist_template_items: Array<{ count: number }>;
  };

  const templatesRes = await service
    .from("checklist_templates")
    .select("id, name, matter_type, description, is_global, created_at, checklist_template_items(count)")
    .or(`organization_id.eq.${ctx.organization.id},is_global.eq.true`)
    .order("name", { ascending: true });
  const templates = (templatesRes.data ?? []) as TemplateRow[];

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
            const itemCount = tpl.checklist_template_items[0]?.count ?? 0;
            return (
              <Card key={tpl.id} className="h-full p-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {MATTER_TYPE_LABEL[tpl.matter_type]} {tpl.is_global && "· Global"}
                  </p>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{tpl.name}</h3>
                  {tpl.description && <p className="text-sm text-muted-foreground">{tpl.description}</p>}
                </div>
                <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileBadge className="h-3.5 w-3.5" /> {itemCount} items
                  </span>
                </div>
              </Card>
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
