/**
 * Snapshot-style assertions on `renderEmailHtml` so a regression in the
 * branded layout (missing CTA button, broken logo fallback, dropped
 * "Powered by IntakeClean" footer) trips the test suite before reaching a
 * real client inbox.
 */
import { renderEmailHtml } from "@/lib/messaging/email-html";
import {
  renderInitial,
  renderReminder,
  renderReupload,
} from "@/lib/messaging/templates";

const baseArgs = {
  firmName: "Acme Law",
  heading: "Documents needed",
  bodyParagraphs: ["Hi Jane,", "Please upload your documents."],
  cta: { label: "Upload your documents", href: "https://intakeclean.test/upload/abc123" },
  signOff: "Thanks, Acme Law",
  appUrl: "https://intakeclean.test",
};

describe("lib/messaging/email-html > renderEmailHtml", () => {
  it("wraps the upload URL inside an anchor tag styled as a button", () => {
    const html = renderEmailHtml({ ...baseArgs, firmLogoUrl: null });
    expect(html).toContain('href="https://intakeclean.test/upload/abc123"');
    // The button label must be present inside the same anchor — we look
    // for both as a sanity check that the CTA was rendered.
    expect(html).toContain("Upload your documents");
    // Inline button styling needs to survive into the generated string,
    // because email clients strip <style> blocks.
    expect(html).toMatch(/background-color:#0B1220/);
    expect(html).toMatch(/border-radius:10px/);
  });

  it("renders the firm name as a wordmark when no logo URL is provided", () => {
    const html = renderEmailHtml({ ...baseArgs, firmLogoUrl: null });
    expect(html).toContain("Acme Law");
    expect(html).not.toContain("<img src=");
  });

  it("renders the firm logo as an <img> when a logo URL is provided", () => {
    const html = renderEmailHtml({
      ...baseArgs,
      firmLogoUrl: "https://cdn.example.com/acme.png",
    });
    expect(html).toContain('src="https://cdn.example.com/acme.png"');
    expect(html).toContain('alt="Acme Law"');
  });

  it("escapes HTML-special characters in the firm name to prevent injection", () => {
    const html = renderEmailHtml({
      ...baseArgs,
      firmName: "Acme & <script>alert(1)</script>",
      firmLogoUrl: null,
    });
    expect(html).toContain("Acme &amp; &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes double quotes inside attribute values from the logo URL", () => {
    const html = renderEmailHtml({
      ...baseArgs,
      firmLogoUrl: 'https://x.test/a.png" onerror="alert(1)',
    });
    // The trailing `" onerror=...` must be escaped so it can't break out
    // of the src=... attribute and add a JS handler.
    expect(html).not.toContain('onerror="alert(1)');
    expect(html).toContain("&quot;");
  });

  it("includes the 'Securely powered by IntakeClean' footer", () => {
    const html = renderEmailHtml({ ...baseArgs, firmLogoUrl: null });
    expect(html).toContain("Securely powered by");
    expect(html).toContain("IntakeClean");
  });

  it("renders the secondaryNote callout when provided (re-upload flow)", () => {
    const html = renderEmailHtml({
      ...baseArgs,
      firmLogoUrl: null,
      secondaryNote: {
        title: "Item to retake",
        lines: ["Driver's License", "Reason: blurry corners"],
      },
    });
    expect(html).toContain("Item to retake");
    expect(html).toContain("Driver&#39;s License".replace("&#39;", "'"));
    expect(html).toContain("Reason: blurry corners");
  });

  it("omits the secondaryNote callout when not provided", () => {
    const html = renderEmailHtml({ ...baseArgs, firmLogoUrl: null });
    expect(html).not.toContain("Item to retake");
  });
});

describe("lib/messaging/templates emailHtml output", () => {
  const ctx = {
    firmName: "Acme Law",
    clientName: "Jane Doe",
    matterName: "Estate of John Doe",
    uploadLink: "https://intakeclean.test/upload/abc123",
  };

  it("renderInitial produces an HTML body containing the upload-link button and firm name", () => {
    const out = renderInitial({ ...ctx, firmLogoUrl: null });
    expect(out.emailHtml.length).toBeGreaterThan(0);
    expect(out.emailHtml).toContain('href="https://intakeclean.test/upload/abc123"');
    expect(out.emailHtml).toContain("Acme Law");
    expect(out.emailHtml).toContain("Upload your documents");
  });

  it("renderReminder produces an HTML body with the 'Friendly reminder' heading", () => {
    const out = renderReminder({ ...ctx, firmLogoUrl: null });
    expect(out.emailHtml).toContain("Friendly reminder");
    expect(out.emailHtml).toContain('href="https://intakeclean.test/upload/abc123"');
  });

  it("renderReupload produces an HTML body with a re-upload secondary note", () => {
    const out = renderReupload({
      ...ctx,
      firmLogoUrl: null,
      itemName: "Driver's License",
      reason: "blurry corners",
    });
    expect(out.emailHtml).toContain("One document needs to be retaken");
    expect(out.emailHtml).toContain("Item to retake");
    expect(out.emailHtml).toContain("blurry corners");
  });

  it("renderInitial threads the firmLogoUrl into the rendered HTML <img>", () => {
    const out = renderInitial({ ...ctx, firmLogoUrl: "https://cdn.example.com/acme.png" });
    expect(out.emailHtml).toContain('src="https://cdn.example.com/acme.png"');
  });
});
