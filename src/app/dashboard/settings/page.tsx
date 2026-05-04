import { Building2, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSession } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";

import {
  updateOrganizationAction,
  updateProfileAction,
  updateUserRoleAction,
} from "@/app/dashboard/settings/actions";

interface ProfileRow {
  id: string;
  full_name: string;
  role: "admin" | "paralegal" | "attorney";
  created_at: string;
}

export default async function SettingsPage() {
  const ctx = await requireSession();
  const service = getServiceSupabase();
  const { data } = await service
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: true });
  const team = (data ?? []) as ProfileRow[];

  const isAdmin = ctx.profile.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Firm profile, team, and notification preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Firm profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateOrganizationAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Firm name</Label>
              <Input id="name" name="name" defaultValue={ctx.organization.name} required disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logo_url">Logo URL (optional)</Label>
              <Input
                id="logo_url"
                name="logo_url"
                defaultValue={ctx.organization.logo_url ?? ""}
                placeholder="https://…"
                disabled={!isAdmin}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!isAdmin}>
                Save firm details
              </Button>
              {!isAdmin && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only firm admins can change firm-level settings.
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Your profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateProfileAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" defaultValue={ctx.profile.full_name} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={ctx.email ?? ""} disabled />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Update profile</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Team members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {team.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{member.full_name}</p>
                  <Badge variant="outline" className="mt-1 capitalize">
                    {member.role}
                  </Badge>
                </div>
                {isAdmin && member.id !== ctx.profile.id ? (
                  <form action={updateUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="profile_id" value={member.id} />
                    <select
                      name="role"
                      defaultValue={member.role}
                      className="h-9 rounded-xl border border-input bg-card px-3 text-sm"
                    >
                      <option value="admin">Admin</option>
                      <option value="paralegal">Paralegal</option>
                      <option value="attorney">Attorney</option>
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {member.id === ctx.profile.id ? "You" : "View only"}
                  </span>
                )}
              </li>
            ))}
            {team.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">No team members yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
