import Link from "next/link";
import { notFound } from "next/navigation";

import { NewRequestForm } from "@/app/dashboard/matters/[matterId]/requests/new/new-request-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

interface PageProps {
  params: Promise<{ matterId: string }>;
}

export default async function NewRequestPage({ params }: PageProps) {
  const { matterId } = await params;
  const ctx = await requireSession();
  const service = getServiceSupabase();

  type MatterShape = {
    id: string;
    matter_name: string;
    matter_type: import("@/types/database").MatterTypeT;
    clients: { full_name: string } | null;
  };
  type TemplateShape = {
    id: string;
    name: string;
    matter_type: import("@/types/database").MatterTypeT;
    checklist_template_items: Array<{
      id: string;
      title: string;
      description: string | null;
      required: boolean;
      sort_order: number;
    }>;
  };

  const matterRes = await service
    .from("matters")
    .select("id, matter_name, matter_type, clients(full_name)")
    .eq("id", matterId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const matter = matterRes.data as MatterShape | null;
  if (!matter) notFound();

  const templatesRes = await service
    .from("checklist_templates")
    .select("id, name, matter_type, checklist_template_items(id, title, description, required, sort_order)")
    .or(`organization_id.eq.${ctx.organization.id},is_global.eq.true`)
    .order("name", { ascending: true });
  const templates = (templatesRes.data ?? []) as TemplateShape[];

  const matterClient = matter.clients;

  const templateOptions = templates.map((t) => {
    const items = t.checklist_template_items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        title: i.title,
        description: i.description ?? "",
        required: i.required,
      }));
    return {
      id: t.id,
      name: t.name,
      matter_type: t.matter_type,
      items,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Send document request</h1>
          <p className="text-muted-foreground">
            For {matter.matter_name} · {matterClient?.full_name ?? "No client"}
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href={`/dashboard/matters/${matter.id}`}>Cancel</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <NewRequestForm
            matterId={matter.id}
            matterType={matter.matter_type}
            defaultTitle={`Documents for ${matter.matter_name}`}
            templates={templateOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
