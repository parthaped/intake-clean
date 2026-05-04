"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Image as ImageIcon, Inbox, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { cn, formatBytes } from "@/lib/utils";
import type { RequestItemStatus } from "@/types/database";

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  status: RequestItemStatus;
}

interface ClientUploadPortalProps {
  token: string;
  items: ChecklistItem[];
  focusItemId?: string;
}

interface PendingFile {
  id: string;
  file: File;
  itemId: string | null;
  status: "queued" | "uploading" | "success" | "error";
  error?: string;
  preview?: string;
}

const dropzoneAccept = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/webp": [".webp"],
};

export function ClientUploadPortal({ token, items, focusItemId }: ClientUploadPortalProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);

  const visibleItems = useMemo(() => {
    if (!focusItemId) return items;
    return items.filter((item) => item.id === focusItemId);
  }, [focusItemId, items]);

  const queueFiles = useCallback((files: File[], itemId: string | null) => {
    const next: PendingFile[] = [];
    for (const file of files) {
      if (!ACCEPTED_FILE_TYPES.includes(file.type as (typeof ACCEPTED_FILE_TYPES)[number])) {
        toast.error(`${file.name}: file type not accepted`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`${file.name}: file is over 50 MB`);
        continue;
      }
      next.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        itemId,
        status: "queued",
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    }
    if (next.length > 0) setPending((prev) => [...prev, ...next]);
  }, []);

  function removeFile(id: string) {
    setPending((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  }

  async function uploadAll() {
    if (pending.length === 0) return;
    setBusy(true);
    let allOk = true;
    for (const file of pending) {
      if (file.status === "success") continue;
      setPending((prev) => prev.map((p) => (p.id === file.id ? { ...p, status: "uploading", error: undefined } : p)));
      try {
        const fd = new FormData();
        fd.append("file", file.file);
        if (file.itemId) fd.append("request_item_id", file.itemId);
        const res = await fetch(`/api/upload/${token}`, { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Upload failed");
        }
        setPending((prev) => prev.map((p) => (p.id === file.id ? { ...p, status: "success" } : p)));
      } catch (err) {
        allOk = false;
        const message = err instanceof Error ? err.message : "Upload failed";
        setPending((prev) =>
          prev.map((p) => (p.id === file.id ? { ...p, status: "error", error: message } : p)),
        );
      }
    }
    setBusy(false);
    if (allOk) {
      toast.success("All files uploaded");
      router.push(`/upload/${token}/complete`);
      router.refresh();
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {visibleItems.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          pending={pending.filter((p) => p.itemId === item.id)}
          onDrop={(files) => queueFiles(files, item.id)}
          onRemove={removeFile}
        />
      ))}

      {!focusItemId && (
        <ItemCard
          item={{
            id: "general",
            title: "I'm not sure what this is",
            description: "Drop anything else you have. Staff will review and label it.",
            required: false,
            status: "missing",
          }}
          general
          pending={pending.filter((p) => p.itemId === null)}
          onDrop={(files) => queueFiles(files, null)}
          onRemove={removeFile}
        />
      )}

      {pending.length > 0 && (
        <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="text-sm">
            <span className="font-medium text-foreground">{pending.length}</span>{" "}
            <span className="text-muted-foreground">file{pending.length === 1 ? "" : "s"} ready to send</span>
          </div>
          <Button onClick={uploadAll} disabled={busy} size="lg">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Upload {pending.length} file{pending.length === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  pending,
  onDrop,
  onRemove,
  general = false,
}: {
  item: ChecklistItem;
  pending: PendingFile[];
  onDrop: (files: File[]) => void;
  onRemove: (id: string) => void;
  general?: boolean;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: dropzoneAccept,
    onDrop,
    multiple: true,
    maxSize: MAX_FILE_SIZE_BYTES,
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {item.title}
              {item.required && !general && <span className="ml-1 text-xs text-destructive">·required</span>}
            </p>
            {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
          </div>
          {!general && <StatusBadge kind="request-item" status={item.status} />}
        </div>

        <div
          {...getRootProps({
            className: cn(
              "flex min-h-[110px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/30 p-4 text-center text-sm transition",
              isDragActive && "border-accent bg-accent/10 text-accent",
            ),
          })}
        >
          <input {...getInputProps()} />
          <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-foreground">
            {isDragActive ? "Drop files here" : "Tap to add a photo or PDF, or drag & drop"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">PDF, JPG, PNG, HEIC, WebP · up to 50 MB</p>
        </div>

        {pending.length > 0 && (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2 pr-3"
              >
                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt={p.file.name} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(p.file.size)}</p>
                  {p.status === "error" && <p className="text-xs text-destructive">{p.error}</p>}
                </div>
                <PendingStatus status={p.status} />
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PendingStatus({ status }: { status: PendingFile["status"] }) {
  if (status === "queued") return <span className="text-xs text-muted-foreground">Ready</span>;
  if (status === "uploading") return <Loader2 className="h-4 w-4 animate-spin text-info" />;
  if (status === "success") return <ShieldCheck className="h-4 w-4 text-success" />;
  return <Inbox className="h-4 w-4 text-destructive" />;
}
