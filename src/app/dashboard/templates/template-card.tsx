"use client";

import { useState } from "react";
import { ChevronDown, FileBadge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { MatterTypeT } from "@/types/database";

export interface TemplateCardItem {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  sort_order: number;
}

export interface TemplateCardProps {
  id: string;
  name: string;
  matter_type: MatterTypeT;
  description: string | null;
  is_global: boolean;
  items: TemplateCardItem[];
}

export function TemplateCard({ name, matter_type, description, is_global, items }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = items.length;
  const panelId = `template-items-${name.replace(/\s+/g, "-")}`;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {MATTER_TYPE_LABEL[matter_type]} {is_global && "· Global"}
        </p>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{name}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="mt-5 flex items-center justify-between rounded-lg text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-1">
          <FileBadge className="h-3.5 w-3.5" /> {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        <span className="flex items-center gap-1">
          {expanded ? "Hide" : "View"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </span>
      </button>

      {expanded && (
        <ul id={panelId} className="mt-3 space-y-2 border-t border-border pt-3">
          {items.length === 0 ? (
            <li className="text-xs text-muted-foreground">No checklist items.</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="rounded-lg bg-secondary/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {!item.required && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Optional
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  );
}
