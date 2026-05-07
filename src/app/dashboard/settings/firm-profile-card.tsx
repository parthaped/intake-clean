"use client";

import { ImagePlus, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  removeFirmLogoAction,
  updateOrganizationAction,
  uploadFirmLogoAction,
} from "@/app/dashboard/settings/actions";

interface FirmProfileCardProps {
  firmName: string;
  logoUrl: string | null;
  isAdmin: boolean;
}

const ACCEPTED_LOGO_MIME_LIST = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Firm-profile card with two ways to set the logo:
 *  - "Upload file" tab: drag-and-drop / file-picker that writes through to
 *    the public `firm-logos` bucket via `uploadFirmLogoAction`.
 *  - "Paste URL" tab: legacy fallback for firms that already host their
 *    logo elsewhere (e.g. their existing CMS).
 *
 * The firm-name input + URL field are submitted together via the existing
 * `updateOrganizationAction` so admins can rename their org without
 * re-uploading the logo (and vice versa).
 */
export function FirmProfileCard({ firmName, logoUrl, isAdmin }: FirmProfileCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-primary" /> Firm profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <CurrentLogoPreview firmName={firmName} logoUrl={logoUrl} isAdmin={isAdmin} />

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="w-full max-w-sm">
            <TabsTrigger value="upload" className="flex-1 gap-2">
              <Upload className="h-3.5 w-3.5" /> Upload file
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1">
              Paste URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadLogoForm isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="url">
            <UrlLogoForm firmName={firmName} logoUrl={logoUrl} isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CurrentLogoPreview({
  firmName,
  logoUrl,
  isAdmin,
}: {
  firmName: string;
  logoUrl: string | null;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!logoUrl) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/60 text-xs font-semibold uppercase text-muted-foreground">
          {initials(firmName)}
        </div>
        <div>
          <p className="font-medium text-foreground">No logo set</p>
          <p className="text-xs">Clients see your firm name as a wordmark in emails and on the upload page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/40 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={`${firmName} logo`}
        className="h-12 w-auto max-w-[200px] rounded-md bg-white object-contain p-1"
      />
      <div className="flex-1 text-sm">
        <p className="font-medium text-foreground">Current logo</p>
        <p className="break-all text-xs text-muted-foreground">{logoUrl}</p>
      </div>
      {isAdmin && (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await removeFirmLogoAction();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not remove logo");
                }
              });
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? "Removing…" : "Remove logo"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function UploadLogoForm({ isAdmin }: { isAdmin: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  function pickFile(file: File | null | undefined) {
    setError(null);
    if (!file) {
      setPreviewUrl(null);
      setPickedName(null);
      return;
    }
    if (!ACCEPTED_LOGO_MIME_LIST.split(",").includes(file.type)) {
      setError("Logo must be a PNG, JPEG, WebP, or SVG image.");
      setPreviewUrl(null);
      setPickedName(null);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2 MB or smaller.");
      setPreviewUrl(null);
      setPickedName(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setPickedName(file.name);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await uploadFirmLogoAction(formData);
        setPreviewUrl(null);
        setPickedName(null);
        if (inputRef.current) inputRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Logo upload failed");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <label
        htmlFor="logo"
        onDragOver={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            inputRef.current.files = dt.files;
            pickFile(file);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground transition-colors",
          isDragging && "border-accent bg-accent/5",
          !isAdmin && "cursor-not-allowed opacity-60",
        )}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Selected logo preview"
              className="h-14 w-auto max-w-[200px] rounded-md bg-white object-contain p-1"
            />
            <p className="text-xs font-medium text-foreground">{pickedName}</p>
            <p className="text-xs text-muted-foreground">Click "Save logo" to apply.</p>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" />
            <p className="text-foreground">
              <span className="font-medium">Click to choose</span> or drag-and-drop
            </p>
            <p className="text-xs">PNG, JPEG, WebP, or SVG up to 2 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          id="logo"
          name="logo"
          type="file"
          accept={ACCEPTED_LOGO_MIME_LIST}
          className="hidden"
          disabled={!isAdmin}
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={!isAdmin || isPending || !pickedName}>
        {isPending ? "Uploading…" : "Save logo"}
      </Button>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground">Only firm admins can change firm-level settings.</p>
      )}
    </form>
  );
}

function UrlLogoForm({
  firmName,
  logoUrl,
  isAdmin,
}: {
  firmName: string;
  logoUrl: string | null;
  isAdmin: boolean;
}) {
  return (
    <form action={updateOrganizationAction} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">Firm name</Label>
        <Input id="name" name="name" defaultValue={firmName} required disabled={!isAdmin} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="logo_url">Logo URL</Label>
        <Input
          id="logo_url"
          name="logo_url"
          defaultValue={logoUrl ?? ""}
          placeholder="https://…"
          disabled={!isAdmin}
        />
        <p className="text-xs text-muted-foreground">
          Already host your logo elsewhere? Paste a public URL — replaces an uploaded logo.
        </p>
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
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "FN";
}
