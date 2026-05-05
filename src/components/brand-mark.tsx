import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { box: "h-7 w-7 rounded-[10px]", text: "text-sm" },
  md: { box: "h-9 w-9 rounded-[12px]", text: "text-base" },
  lg: { box: "h-12 w-12 rounded-[16px]", text: "text-xl" },
};

export function BrandMark({ className, withWordmark = true, size = "md" }: BrandMarkProps) {
  const s = sizeMap[size];
  return (
    <div className={cn("flex items-center gap-2.5 text-foreground", className)}>
      <span
        aria-hidden
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden bg-[#0B1220] shadow-[0_2px_6px_-1px_rgba(11,18,32,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/5",
          s.box,
        )}
      >
        <svg viewBox="0 0 64 64" className="h-[78%] w-[78%]" fill="none" aria-hidden>
          <rect x="13" y="11" width="32" height="40" rx="5.5" fill="#F6F8F5" />
          <path d="M19 22h17" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
          <path d="M19 30h20" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
          <path d="M19 38h13" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
          <circle cx="46" cy="46" r="11" fill="#22C55E" />
          <path
            d="M40.5 45.8L44.5 49.8L51.5 41.5"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {withWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight [font-feature-settings:'cv11','ss01']",
            s.text,
          )}
        >
          Intake<span className="text-accent">Clean</span>
        </span>
      )}
    </div>
  );
}
