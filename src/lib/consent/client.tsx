"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  buildRecord,
  categoryMap,
  defaultDecision,
  encodeConsent,
} from "./cookie";
import {
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  type ConsentCategory,
  type ConsentRecord,
  type ConsentRegion,
  type ConsentSource,
} from "./types";

interface ConsentContextValue {
  record: ConsentRecord | null;
  region: ConsentRegion;
  /** True when the banner should currently be visible. */
  bannerOpen: boolean;
  /** True when the granular settings modal is open. */
  modalOpen: boolean;
  /** Best-effort GPC detection. `null` until we've checked. */
  gpc: boolean | null;
  /** Categories projected as a flat boolean map for easy consumption. */
  categories: Record<ConsentCategory, boolean>;
  /** Persist a decision and close the banner. */
  save: (categories: ConsentRecord["categories"], source: ConsentSource) => void;
  acceptAll: () => void;
  essentialOnly: () => void;
  openModal: () => void;
  closeModal: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

interface ConsentProviderProps {
  initialRecord: ConsentRecord | null;
  initialRegion: ConsentRegion;
  initialRequiresPrompt: boolean;
  children: ReactNode;
}

export function ConsentProvider({
  initialRecord,
  initialRegion,
  initialRequiresPrompt,
  children,
}: ConsentProviderProps) {
  const [record, setRecord] = useState<ConsentRecord | null>(initialRecord);
  const [bannerOpen, setBannerOpen] = useState<boolean>(initialRequiresPrompt && !initialRecord);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [gpc, setGpc] = useState<boolean | null>(null);

  const persist = useCallback(
    (next: ConsentRecord) => {
      const value = encodeConsent(next);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      // Mirrors `serializeSetCookie` in `cookie.ts`. We intentionally don't
      // share that helper because `document.cookie` only accepts a subset
      // of the syntax and the server uses `Set-Cookie` headers instead.
      document.cookie =
        `${CONSENT_COOKIE_NAME}=${value}; Path=/; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
      setRecord(next);
      setBannerOpen(false);
      setModalOpen(false);
    },
    [],
  );

  const save = useCallback(
    (categories: ConsentRecord["categories"], source: ConsentSource) => {
      const next = buildRecord({
        region: initialRegion,
        gpc: gpc === true,
        source,
        categories,
      });
      persist(next);
    },
    [gpc, initialRegion, persist],
  );

  const acceptAll = useCallback(() => {
    save(
      { necessary: true, functional: true, analytics: true },
      "banner_accept_all",
    );
  }, [save]);

  const essentialOnly = useCallback(() => {
    save(
      { necessary: true, functional: false, analytics: false },
      "banner_essential_only",
    );
  }, [save]);

  // GPC: if the browser advertises Global Privacy Control and the user has
  // not already recorded a manual decision, auto-record an opt-out and skip
  // the banner. A manual decision (record !== null) wins, per CCPA guidance.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const signal =
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl ===
      true;
    setGpc(signal);
    if (signal && !record) {
      const auto = buildRecord({
        region: initialRegion,
        gpc: true,
        source: "auto_gpc",
        categories: {
          necessary: true,
          functional: false,
          analytics: false,
        },
      });
      persist(auto);
    }
    // We intentionally only run this once on mount; subsequent record
    // changes don't need to re-trigger the GPC check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<ConsentContextValue>(() => {
    return {
      record,
      region: initialRegion,
      bannerOpen,
      modalOpen,
      gpc,
      categories: categoryMap(record) ?? defaultDecision(initialRegion),
      save,
      acceptAll,
      essentialOnly,
      openModal: () => setModalOpen(true),
      closeModal: () => setModalOpen(false),
    };
  }, [record, initialRegion, bannerOpen, modalOpen, gpc, save, acceptAll, essentialOnly]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent() must be used inside <ConsentProvider>.");
  }
  return ctx;
}

/**
 * Read-only hook that returns `true` when the given category is allowed.
 * Use this from analytics/feature shims so they can no-op without consent.
 */
export function useCategoryAllowed(category: ConsentCategory): boolean {
  const { categories } = useConsent();
  return categories[category];
}
