/**
 * Cookie-consent types for IntakeClean's marketing surface.
 *
 * The shape is deliberately small: three categories, a version number, a
 * region tag, a GPC flag, the source of the decision, and a timestamp. We
 * persist this verbatim into the `ic-consent` cookie. Anything richer (a
 * full audit trail, IAB TCF strings, vendor lists) would over-promise for
 * a product that runs no ad-tech and no analytics today.
 *
 * Bump `CONSENT_VERSION` whenever the categories or their meaning change in
 * a way that requires re-prompting the user. Stored records below the
 * current version are treated as "no decision" and the banner re-appears.
 */

/** Stable category keys. Adding/removing values is a material change → bump version. */
export type ConsentCategory = "necessary" | "functional" | "analytics";

/** Coarse region used to decide whether a consent prompt is legally required. */
export type ConsentRegion = "EEA" | "UK" | "US" | "OTHER";

/** Where the recorded decision came from. Useful for debugging and audits. */
export type ConsentSource =
  | "banner_accept_all"
  | "banner_essential_only"
  | "modal_save"
  | "auto_gpc";

/**
 * The decisions persisted in the `ic-consent` cookie.
 *
 * `categories.necessary` is intentionally typed `true` — strictly-necessary
 * cookies cannot be declined under ePrivacy / CCPA. Encoding the constraint
 * into the type keeps callers honest.
 */
export interface ConsentRecord {
  v: typeof CONSENT_VERSION;
  ts: string;
  region: ConsentRegion;
  gpc: boolean;
  source: ConsentSource;
  categories: {
    necessary: true;
    functional: boolean;
    analytics: boolean;
  };
}

/**
 * Schema version. Bump whenever:
 *   - a new category is added or removed,
 *   - the meaning of an existing category changes materially,
 *   - or a new sub-processor that touches the categories is enabled.
 *
 * Stored records with `v < CONSENT_VERSION` are treated as missing so the
 * banner re-prompts the user (EDPB-required behaviour for material changes).
 */
export const CONSENT_VERSION = 1;

/** Cookie name. Matches the `ic-*` convention in the cookie notice. */
export const CONSENT_COOKIE_NAME = "ic-consent";

/** One year. Tracks the practical re-prompt cadence used by most CMPs. */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Regions that always require an opt-in prompt before non-essential cookies. */
export const CONSENT_PROMPT_REQUIRED_REGIONS: ReadonlySet<ConsentRegion> = new Set([
  "EEA",
  "UK",
]);
