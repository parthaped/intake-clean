import Link from "next/link";

import { NewMatterForm } from "@/app/dashboard/matters/new/new-matter-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function NewMatterPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const { data: clients } = await service
    .from("clients")
    .select("id, full_name, email, phone")
    .eq("organization_id", ctx.organization.id)
    .order("full_name", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Create matter</h1>
          <p className="text-muted-foreground">Pick an existing client or add a new one inline.</p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/dashboard/matters">Cancel</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <NewMatterForm clients={clients ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
