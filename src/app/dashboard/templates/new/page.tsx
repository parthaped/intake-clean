import Link from "next/link";

import { NewTemplateForm } from "@/app/dashboard/templates/new/new-template-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NewTemplatePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">New template</h1>
          <p className="text-muted-foreground">Define a reusable checklist for a matter type.</p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/dashboard/templates">Cancel</Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-6">
          <NewTemplateForm />
        </CardContent>
      </Card>
    </div>
  );
}
