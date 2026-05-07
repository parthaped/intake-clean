import "server-only";

import { APP_NAME, DISCLAIMER_LINES } from "@/lib/constants";

export interface EmailHtmlArgs {
  /** Firm display name shown in the header beside (or instead of) the logo. */
  firmName: string;
  /**
   * Public URL of the firm's logo. When null/missing the header falls back to
   * a text wordmark of `firmName`. The image is loaded from the recipient's
   * inbox so this MUST be a publicly reachable URL.
   */
  firmLogoUrl?: string | null;
  /** Headline shown above the body paragraphs (e.g. "Documents needed"). */
  heading: string;
  /** Body paragraphs in display order. */
  bodyParagraphs: string[];
  /** Primary call-to-action button at the centre of the email. */
  cta: { label: string; href: string };
  /**
   * Optional secondary callout rendered just below the CTA — used by the
   * re-upload flow to show the item title and reason in a tinted box.
   */
  secondaryNote?: { title: string; lines: string[] } | null;
  /** Plain-text closing sign-off ("Thanks, Acme Law"). */
  signOff: string;
  /** Absolute base URL for the IntakeClean wordmark link in the footer. */
  appUrl: string;
}

/**
 * Render a branded HTML email body.
 *
 * Uses inline styles + a single `<table>` because that's the only layout
 * approach Gmail, Outlook desktop, and the iOS/Android mail clients all
 * render reliably. We deliberately do NOT pull in tailwind, css modules, or
 * any external stylesheets here — those don't survive the Resend → Gmail
 * pipeline.
 *
 * The plain-text alternative is generated separately in `templates.ts` and
 * sent in the same multipart/alternative message, so this function only
 * needs to focus on the HTML rendition.
 */
export function renderEmailHtml(args: EmailHtmlArgs): string {
  const {
    firmName,
    firmLogoUrl,
    heading,
    bodyParagraphs,
    cta,
    secondaryNote,
    signOff,
    appUrl,
  } = args;

  const logoBlock = firmLogoUrl
    ? `<img src="${escapeAttr(firmLogoUrl)}" alt="${escapeAttr(firmName)}" height="36" style="display:block;max-height:36px;width:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:18px;font-weight:600;color:#0B1220;letter-spacing:-0.01em;">${escapeText(firmName)}</span>`;

  const paragraphsHtml = bodyParagraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#1f2937;">${escapeText(p)}</p>`,
    )
    .join("");

  const secondaryHtml = secondaryNote
    ? `
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;line-height:1.55;color:#7c2d12;">
                      <strong style="display:block;margin-bottom:4px;color:#9a3412;">${escapeText(secondaryNote.title)}</strong>
                      ${secondaryNote.lines.map((l) => `<div>${escapeText(l)}</div>`).join("")}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    : "";

  const disclaimer = DISCLAIMER_LINES[0] ?? "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeText(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0B1220;">
    <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;mso-hide:all;overflow:hidden;">${escapeText(heading)} — secure upload from ${escapeText(firmName)}.</span>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f5f7;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px 16px 32px;border-bottom:1px solid #f1f1f4;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      ${logoBlock}
                    </td>
                    <td align="right" style="vertical-align:middle;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">
                      Secure upload
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 4px 32px;">
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#0B1220;font-weight:600;letter-spacing:-0.01em;">${escapeText(heading)}</h1>
                ${paragraphsHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                  <tr>
                    <td align="center" bgcolor="#0B1220" style="border-radius:10px;">
                      <a href="${escapeAttr(cta.href)}"
                         style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background-color:#0B1220;line-height:1;">
                        ${escapeText(cta.label)}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0;font-size:12px;color:#6b7280;line-height:1.5;">
                  Or paste this link into your browser:<br />
                  <a href="${escapeAttr(cta.href)}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${escapeText(cta.href)}</a>
                </p>
              </td>
            </tr>${secondaryHtml}
            <tr>
              <td style="padding:0 32px 28px 32px;">
                <p style="margin:0;font-size:15px;line-height:1.55;color:#1f2937;">${escapeText(signOff)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 22px 32px;border-top:1px solid #f1f1f4;background-color:#fafbfc;">
                <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;line-height:1.5;">
                  Securely powered by
                  <a href="${escapeAttr(appUrl)}" style="color:#0B1220;text-decoration:none;font-weight:600;">${escapeText(APP_NAME)}</a>.
                </p>
                <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">${escapeText(disclaimer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Minimal HTML-text escape used inside element content. Email clients are
 * far less forgiving than browsers about unescaped `<` / `&` so we always
 * escape user-supplied strings (firm name, client name, item title, reason)
 * even when they're "trusted" within our own DB.
 */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Stricter escape for double-quoted attribute values. Importantly we also
 * escape `"` so a malformed `logo_url` can't break out of the attribute and
 * inject script handlers.
 */
function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
