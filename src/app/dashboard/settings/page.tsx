import { Building2, ShieldCheck, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_PROVIDER_LABEL, OCR_ENGINE_LABEL } from "@/lib/constants";
import { env, integrations } from "@/lib/env";
import { requireSessionWithMfa } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { AIProviderName, Json, OcrEngineName } from "@/types/database";

import {
  updateAISettingsAction,
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
  const ctx = await requireSessionWithMfa();
  const service = getServiceSupabase();
  const { data } = await service
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: true });
  const team = (data ?? []) as ProfileRow[];

  const isAdmin = ctx.profile.role === "admin";
  const aiProvider = (ctx.organization.ai_provider ?? env.aiProvider) as AIProviderName;
  const aiSettings = readAISettings(ctx.organization.ai_settings as Json | null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Firm profile, team, AI processing, and notification preferences.</p>
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
            <Sparkles className="h-4 w-4 text-primary" /> Document AI Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAISettingsAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai_provider">AI provider</Label>
              <select
                id="ai_provider"
                name="ai_provider"
                defaultValue={aiProvider}
                disabled={!isAdmin}
                className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
              >
                {(Object.keys(AI_PROVIDER_LABEL) as AIProviderName[]).map((key) => (
                  <option key={key} value={key}>
                    {AI_PROVIDER_LABEL[key]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Mock and Local OCR never send documents off-device. Hugging Face options send the OCR text only,
                and only when the toggles below are on.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ocr_engine">OCR engine</Label>
              <select
                id="ocr_engine"
                name="ocr_engine"
                defaultValue={aiSettings.ocr_engine}
                disabled={!isAdmin}
                className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
              >
                {(Object.keys(OCR_ENGINE_LABEL) as OcrEngineName[]).map((key) => (
                  <option key={key} value={key}>
                    {OCR_ENGINE_LABEL[key]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Tesseract runs in this server process — no external service. PaddleOCR is reserved for a future
                self-hosted microservice.
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3 md:col-span-1">
              <input
                type="checkbox"
                name="use_hf_classification"
                defaultChecked={aiSettings.use_hf_classification}
                disabled={!isAdmin}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">Use Hugging Face for uncertain document classification</span>
                <span className="block text-xs text-muted-foreground">
                  Only called when local rules can&rsquo;t classify confidently.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3 md:col-span-1">
              <input
                type="checkbox"
                name="use_hf_explanations"
                defaultChecked={aiSettings.use_hf_explanations}
                disabled={!isAdmin}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">Use Hugging Face to rewrite client re-upload reasons</span>
                <span className="block text-xs text-muted-foreground">
                  Templates are sent server-side; clients never see anything until staff approves.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-card/40 p-3 md:col-span-2">
              <input
                type="checkbox"
                name="use_hf_vision"
                defaultChecked={aiSettings.use_hf_vision}
                disabled={!isAdmin || !env.useHfVision}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  Use multimodal vision to auto-screen photo uploads
                </span>
                <span className="block text-xs text-muted-foreground">
                  When clients upload a <em>photo</em> (not PDF), send the 600&nbsp;px JPEG <em>thumbnail</em> to{" "}
                  <code className="font-mono text-[11px]">{env.hfVisionModel}</code> with a strict prompt that
                  forbids transcribing names, numbers, dates of birth, or signatures. The model returns only a
                  document type, a quality verdict, and a short plain-English reason — staff still review every
                  document. {!env.useHfVision && (
                    <span className="text-warning">
                      Disabled at the platform level until <code>USE_HF_VISION=true</code> is set in your environment.
                    </span>
                  )}
                </span>
              </span>
            </label>

            <div className="md:col-span-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              For sensitive documents, use local OCR or a private endpoint. Do not send client files to third-party
              inference services unless your firm has approved it. Vision review (if enabled) sends a downscaled
              thumbnail only — never the original upload, signed URL, or filename.
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">HF token: {integrations.hasHuggingFace ? "configured" : "missing"}</Badge>
              <Badge variant="outline">Endpoint URL: {integrations.hasHfEndpoint ? "configured" : "missing"}</Badge>
              <Badge variant="outline">Mock mode: {integrations.useMockAi ? "on" : "off"}</Badge>
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={!isAdmin}>
                Save AI settings
              </Button>
              {!isAdmin && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only firm admins can change AI settings.
                </p>
              )}
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

interface AISettingsShape {
  ocr_engine: OcrEngineName;
  use_hf_classification: boolean;
  use_hf_explanations: boolean;
  use_hf_vision: boolean;
}

function readAISettings(value: Json | null): AISettingsShape {
  const fallback: AISettingsShape = {
    ocr_engine: env.ocrEngine,
    use_hf_classification: env.useHfClassification,
    use_hf_explanations: env.useHfExplanations,
    // Vision is opt-in: even if `USE_HF_VISION` is on at the platform level
    // we don't pre-flip firms into sending images off-device. They must
    // explicitly check the box in Settings → Document AI.
    use_hf_vision: false,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const v = value as Record<string, unknown>;
  return {
    ocr_engine: typeof v.ocr_engine === "string" ? (v.ocr_engine as OcrEngineName) : fallback.ocr_engine,
    use_hf_classification:
      typeof v.use_hf_classification === "boolean" ? v.use_hf_classification : fallback.use_hf_classification,
    use_hf_vision:
      typeof v.use_hf_vision === "boolean" ? v.use_hf_vision : fallback.use_hf_vision,
    use_hf_explanations:
      typeof v.use_hf_explanations === "boolean" ? v.use_hf_explanations : fallback.use_hf_explanations,
  };
}
