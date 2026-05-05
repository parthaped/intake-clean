"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  countries,
  detectCountry,
  flagFromIso,
  POPULAR_ISO,
  stripDialPrefix,
  type Country,
} from "@/lib/phone-countries";

interface PhoneInputProps {
  /**
   * Form field name. The combined E.164-ish string ("+15551234567") will be
   * submitted under this name. Local-number digits are intentionally not
   * exposed to the form — the parent only ever sees the full international
   * number.
   */
  name: string;
  id?: string;
  /**
   * E.164-ish initial value. The country dropdown auto-detects the matching
   * dial code on mount; anything left over becomes the local number.
   */
  defaultValue?: string;
  defaultIso?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Optional callback fired with the combined "+<dial><digits>" value. */
  onChange?: (value: string) => void;
}

const popularSet = new Set<string>(POPULAR_ISO);

function buildE164(country: Country, national: string): string {
  const digits = national.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `+${country.dial}${digits}`;
}

/**
 * A phone input with a searchable country-code dropdown. The dropdown owns
 * the international prefix, so users only need to type the local digits.
 *
 * The visible text input is not the form field — a hidden input with the
 * combined E.164 value is, so the server receives a single "+<dial><number>"
 * string regardless of how the user typed it.
 */
export function PhoneInput({
  name,
  id,
  defaultValue = "",
  defaultIso = "US",
  placeholder = "555 555 1212",
  disabled,
  className,
  onChange,
}: PhoneInputProps) {
  const initialCountry = React.useMemo(
    () => (defaultValue ? detectCountry(defaultValue, defaultIso) : countries.find((c) => c.iso === defaultIso) ?? countries[0]!),
    [defaultValue, defaultIso],
  );
  const initialNational = React.useMemo(
    () => (defaultValue ? stripDialPrefix(defaultValue, initialCountry.dial) : ""),
    [defaultValue, initialCountry.dial],
  );

  const [country, setCountry] = React.useState<Country>(initialCountry);
  const [national, setNational] = React.useState(initialNational);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  const combined = buildE164(country, national);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  React.useEffect(() => {
    onChangeRef.current?.(combined);
  }, [combined]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        c.dial.includes(q.replace(/^\+/, "")),
    );
  }, [query]);

  const popular = React.useMemo(
    () => (query ? [] : countries.filter((c) => popularSet.has(c.iso))),
    [query],
  );

  function selectCountry(next: Country) {
    setCountry(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={cn("flex w-full items-stretch overflow-hidden rounded-xl border border-input bg-background shadow-sm transition focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1", className)}>
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
          if (next) {
            window.setTimeout(() => searchRef.current?.focus(), 0);
          }
        }}
      >
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Country code: ${country.name} (+${country.dial})`}
            className="flex shrink-0 items-center gap-1.5 border-r border-input bg-secondary/40 px-3 text-sm font-medium text-foreground transition hover:bg-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base leading-none" aria-hidden="true">
              {flagFromIso(country.iso)}
            </span>
            <span className="tabular-nums text-muted-foreground">+{country.dial}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[320px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-soft data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code"
                className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {popular.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Popular
                  </p>
                  {popular.map((c) => (
                    <CountryRow
                      key={`pop-${c.iso}`}
                      country={c}
                      selected={c.iso === country.iso && !query}
                      onSelect={selectCountry}
                    />
                  ))}
                  <div className="my-1 h-px bg-border" />
                  <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    All countries
                  </p>
                </>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
              ) : (
                filtered.map((c) => (
                  <CountryRow
                    key={c.iso}
                    country={c}
                    selected={c.iso === country.iso}
                    onSelect={selectCountry}
                  />
                ))
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        onChange={(e) => {
          // Allow digits, spaces, dashes, parens — strip on submit. Keeps
          // the user's preferred local formatting visible while they type.
          setNational(e.target.value.replace(/[^\d\s\-().]/g, ""));
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="h-10 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input type="hidden" name={name} value={combined} />
    </div>
  );
}

interface CountryRowProps {
  country: Country;
  selected: boolean;
  onSelect: (c: Country) => void;
}

function CountryRow({ country, selected, onSelect }: CountryRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(country)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary focus:bg-secondary focus:outline-none",
        selected && "bg-secondary",
      )}
    >
      <span className="text-base leading-none" aria-hidden="true">
        {flagFromIso(country.iso)}
      </span>
      <span className="flex-1 truncate">{country.name}</span>
      <span className="tabular-nums text-xs text-muted-foreground">+{country.dial}</span>
      {selected && <Check className="h-4 w-4 text-foreground" aria-hidden="true" />}
    </button>
  );
}
