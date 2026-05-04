import { AlertTriangle, Crop, Image as ImageIcon, Move, Scan, ScanText, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QualityFlagListProps {
  blurScore: number | null;
  glareDetected: boolean;
  lowContrastDetected: boolean;
  cutOffEdgesDetected: boolean;
  rotatedDetected: boolean;
  screenshotDetected: boolean;
  textExtractionConfidence: number | null;
  issueSummary: string | null;
  recommendation: "accept" | "review" | "request_reupload" | null;
  isMock?: boolean;
  className?: string;
}

export function QualityFlagList({
  blurScore,
  glareDetected,
  lowContrastDetected,
  cutOffEdgesDetected,
  rotatedDetected,
  screenshotDetected,
  textExtractionConfidence,
  issueSummary,
  recommendation,
  isMock,
  className,
}: QualityFlagListProps) {
  const flags = [
    blurScore != null && blurScore > 0.45
      ? { Icon: ImageIcon, label: `Blurry (${(blurScore * 100).toFixed(0)}%)`, severity: blurScore > 0.65 ? "high" : "medium" }
      : null,
    glareDetected ? { Icon: Sun, label: "Glare detected", severity: "medium" } : null,
    lowContrastDetected ? { Icon: Sun, label: "Dark or low contrast", severity: "medium" } : null,
    cutOffEdgesDetected ? { Icon: Crop, label: "Page appears cut off", severity: "high" } : null,
    rotatedDetected ? { Icon: Move, label: "Image rotated", severity: "low" } : null,
    screenshotDetected ? { Icon: Scan, label: "Looks like a screenshot", severity: "high" } : null,
    textExtractionConfidence != null && textExtractionConfidence < 0.7
      ? {
          Icon: ScanText,
          label: `Low OCR confidence (${(textExtractionConfidence * 100).toFixed(0)}%)`,
          severity: textExtractionConfidence < 0.5 ? "high" : "medium",
        }
      : null,
  ].filter(Boolean) as Array<{ Icon: typeof Sun; label: string; severity: string }>;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {recommendation && (
          <Badge
            variant={
              recommendation === "accept" ? "success" : recommendation === "review" ? "warning" : "destructive"
            }
            className="gap-1.5"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {recommendation === "accept"
              ? "Looks usable"
              : recommendation === "review"
                ? "Worth a closer look"
                : "Recommend re-upload"}
          </Badge>
        )}
        {isMock && (
          <Badge variant="outline" className="gap-1">
            Mock analysis
          </Badge>
        )}
      </div>

      {flags.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {flags.map((flag, idx) => (
            <li
              key={idx}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                flag.severity === "high" && "border-destructive/40 bg-destructive/5 text-destructive",
                flag.severity === "medium" && "border-warning/40 bg-warning/10 text-warning",
                flag.severity === "low" && "border-border bg-secondary/40 text-foreground",
              )}
            >
              <flag.Icon className="h-4 w-4" />
              {flag.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No quality issues detected.</p>
      )}

      {issueSummary && <p className="rounded-xl bg-secondary/40 p-3 text-sm text-foreground">{issueSummary}</p>}
    </div>
  );
}
