import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  withWordmark?: boolean;
}

export function BrandMark({ className, withWordmark = true }: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 6h11l3 3v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 13 2 2 4-4" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-base font-semibold tracking-tight text-foreground">
          Intake<span className="text-accent">Clean</span>
        </span>
      )}
    </div>
  );
}
