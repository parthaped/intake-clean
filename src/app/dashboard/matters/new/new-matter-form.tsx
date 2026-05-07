"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createMatterAction } from "@/app/dashboard/matters/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATTER_TYPE_LABEL } from "@/lib/constants";
import { isNextRedirectError } from "@/lib/utils";
import type { MatterTypeT } from "@/types/database";

interface ClientOption {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

interface NewMatterFormProps {
  clients: ClientOption[];
}

export function NewMatterForm({ clients }: NewMatterFormProps) {
  const [pending, startTransition] = useTransition();
  const [clientMode, setClientMode] = useState<"existing" | "new">(clients.length > 0 ? "existing" : "new");
  const [matterType, setMatterType] = useState<MatterTypeT>("immigration");
  const [clientId, setClientId] = useState<string>("");
  const [contactPref, setContactPref] = useState<"email" | "sms" | "both">("email");

  function handleSubmit(formData: FormData) {
    formData.set("matter_type", matterType);
    formData.set("client_preferred_contact", contactPref);
    if (clientMode === "existing") {
      if (!clientId) {
        toast.error("Pick a client from the list, or switch to “New”.");
        return;
      }
      formData.set("client_id", clientId);
    } else {
      formData.delete("client_id");
    }

    startTransition(async () => {
      try {
        await createMatterAction(formData);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        toast.error(err instanceof Error ? err.message : "Could not create matter");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="matter_name">Matter name</Label>
          <Input id="matter_name" name="matter_name" placeholder="e.g. Garcia I-130" required />
        </div>
        <div className="space-y-1.5">
          <Label>Matter type</Label>
          <Select value={matterType} onValueChange={(v) => setMatterType(v as MatterTypeT)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MATTER_TYPE_LABEL) as MatterTypeT[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {MATTER_TYPE_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="internal_reference">Internal reference (optional)</Label>
          <Input id="internal_reference" name="internal_reference" placeholder="Case number or matter code" />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Client</h3>
          <div className="flex gap-1 rounded-xl bg-card p-1 text-xs">
            <button
              type="button"
              onClick={() => setClientMode("existing")}
              disabled={clients.length === 0}
              className={`rounded-lg px-3 py-1.5 ${clientMode === "existing" ? "bg-secondary text-foreground" : "text-muted-foreground"} disabled:opacity-50`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setClientMode("new")}
              className={`rounded-lg px-3 py-1.5 ${clientMode === "new" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            >
              <Plus className="mr-1 inline h-3 w-3" /> New
            </button>
          </div>
        </div>

        {clientMode === "existing" ? (
          <div className="space-y-1.5">
            <Label htmlFor="client_search">Choose client</Label>
            <ClientCombobox
              clients={clients}
              value={clientId}
              onChange={setClientId}
              inputId="client_search"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client_full_name">Full name</Label>
              <Input id="client_full_name" name="client_full_name" placeholder="Maria Garcia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_email">Email</Label>
              <Input id="client_email" name="client_email" type="email" placeholder="maria@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_phone">Mobile (for SMS)</Label>
              <PhoneInput id="client_phone" name="client_phone" placeholder="555 555 1212" />
            </div>
            <div className="space-y-1.5">
              <Label>Preferred contact</Label>
              <Select value={contactPref} onValueChange={(v) => setContactPref(v as typeof contactPref)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Create matter
        </Button>
      </div>
    </form>
  );
}

const MAX_VISIBLE_MATCHES = 6;

interface ClientComboboxProps {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  inputId?: string;
}

/**
 * Typeahead for picking an existing client. As the user types we:
 *  - filter the client list down to a short set of name matches, and
 *  - inline-autocomplete the input by appending the rest of the best
 *    prefix match and selecting the appended suffix, so the next
 *    keystroke replaces it (the same pattern Gmail "to:" uses).
 *
 * We avoid showing every contact's email up-front; the dropdown only
 * appears while the user is actively typing or has the input focused,
 * and emails are shown as small disambiguation subtitles, not as the
 * primary content of a long list.
 */
function ClientCombobox({ clients, value, onChange, inputId }: ClientComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDeletingRef = useRef(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const selectedClient = useMemo(() => clients.find((c) => c.id === value) ?? null, [clients, value]);
  const [query, setQuery] = useState<string>(selectedClient?.full_name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (selectedClient && query !== selectedClient.full_name) {
      setQuery(selectedClient.full_name);
    }
  }, [selectedClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = clients
      .map((c) => {
        const name = c.full_name.toLowerCase();
        if (!q) return { c, rank: 2 };
        if (name.startsWith(q)) return { c, rank: 0 };
        if (name.split(/\s+/).some((part) => part.startsWith(q))) return { c, rank: 1 };
        if (name.includes(q)) return { c, rank: 2 };
        return null;
      })
      .filter((x): x is { c: ClientOption; rank: number } => x !== null)
      .sort((a, b) => a.rank - b.rank || a.c.full_name.localeCompare(b.c.full_name))
      .slice(0, MAX_VISIBLE_MATCHES)
      .map((x) => x.c);
    return scored;
  }, [clients, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useLayoutEffect(() => {
    const range = pendingSelectionRef.current;
    if (range && inputRef.current) {
      inputRef.current.setSelectionRange(range.start, range.end);
      pendingSelectionRef.current = null;
    }
  });

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  function commit(c: ClientOption) {
    onChange(c.id);
    setQuery(c.full_name);
    setOpen(false);
    pendingSelectionRef.current = null;
    requestAnimationFrame(() => inputRef.current?.blur());
  }

  function clearSelectionIfDiverged(nextQuery: string) {
    if (selectedClient && nextQuery.toLowerCase() !== selectedClient.full_name.toLowerCase()) {
      onChange("");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const typed = e.target.value;
    setOpen(true);
    clearSelectionIfDiverged(typed);

    if (isDeletingRef.current || typed.length === 0) {
      isDeletingRef.current = false;
      setQuery(typed);
      return;
    }

    const lower = typed.toLowerCase();
    const prefixMatch = clients.find((c) => c.full_name.toLowerCase().startsWith(lower));
    if (prefixMatch && prefixMatch.full_name.length > typed.length) {
      const completed = typed + prefixMatch.full_name.slice(typed.length);
      pendingSelectionRef.current = { start: typed.length, end: completed.length };
      setQuery(completed);
      const exactName = prefixMatch.full_name.toLowerCase() === completed.toLowerCase();
      if (exactName) onChange(prefixMatch.id);
      return;
    }

    setQuery(typed);
    const exact = clients.find((c) => c.full_name.toLowerCase() === lower);
    if (exact) onChange(exact.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" || e.key === "Delete") {
      isDeletingRef.current = true;
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (matches.length === 0 ? 0 : Math.min(h + 1, matches.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (open && matches[highlight]) {
        e.preventDefault();
        commit(matches[highlight]);
      }
      return;
    }
    if (e.key === "Tab") {
      const exact = clients.find((c) => c.full_name.toLowerCase() === query.toLowerCase());
      if (exact) commit(exact);
      else setOpen(false);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleBlur() {
    window.setTimeout(() => {
      const exact = clients.find((c) => c.full_name.toLowerCase() === query.toLowerCase());
      if (exact) {
        onChange(exact.id);
        setQuery(exact.full_name);
      }
    }, 120);
  }

  const showDuplicateEmails = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of matches) {
      const key = c.full_name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.values()].some((n) => n > 1);
  }, [matches]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        id={inputId}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={clients.length === 0 ? "No clients yet" : "Start typing a client's name"}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="both"
        aria-controls="client-combobox-listbox"
        disabled={clients.length === 0}
      />
      {open && matches.length > 0 && (
        <ul
          id="client-combobox-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-md"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(c)}
              className={`flex cursor-pointer flex-col rounded-lg px-3 py-2 text-sm ${
                i === highlight ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <span className="font-medium">{c.full_name}</span>
              {showDuplicateEmails && c.email && (
                <span className="text-xs text-muted-foreground">{c.email}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length > 0 && matches.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          No clients match. Switch to “New” to create one.
        </div>
      )}
    </div>
  );
}
