import {
  renderCompletion,
  renderInitial,
  renderReminder,
  renderReupload,
  type TemplateContext,
} from "@/lib/messaging/templates";

const ctx: TemplateContext = {
  firmName: "Acme Law",
  clientName: "Jane Doe",
  matterName: "Estate of John Doe",
  uploadLink: "https://intakeclean.test/u/abc123",
};

describe("lib/messaging/templates", () => {
  describe("renderInitial", () => {
    const out = renderInitial(ctx);

    it("interpolates firmName and matterName into the subject", () => {
      expect(out.subject).toBe("Acme Law needs documents for Estate of John Doe");
    });

    it("greets the client by name in the email body", () => {
      expect(out.emailBody.startsWith("Hi Jane Doe,")).toBeTrue();
    });

    it("includes the upload link in both email and SMS bodies", () => {
      expect(out.emailBody).toContain("https://intakeclean.test/u/abc123");
      expect(out.smsBody).toContain("https://intakeclean.test/u/abc123");
    });

    it("does not leave any unresolved placeholders behind", () => {
      const blob = `${out.subject}\n${out.emailBody}\n${out.smsBody}`;
      expect(blob).not.toMatch(/\{firmName\}|\{clientName\}|\{matterName\}|\{uploadLink\}/);
    });
  });

  describe("renderReminder", () => {
    const out = renderReminder(ctx);

    it("uses the 'Friendly reminder' subject", () => {
      expect(out.subject).toBe("Friendly reminder: documents needed for Estate of John Doe");
    });

    it("still includes the upload link", () => {
      expect(out.emailBody).toContain(ctx.uploadLink);
      expect(out.smsBody).toContain(ctx.uploadLink);
    });
  });

  describe("renderReupload", () => {
    it("uses defaults when itemName / reason are not provided", () => {
      const out = renderReupload(ctx);
      expect(out.emailBody).toContain("Item: the requested document");
      expect(out.emailBody).toContain("Reason: the document needs to be retaken");
    });

    it("interpolates itemName and reason when provided", () => {
      const out = renderReupload({
        ...ctx,
        itemName: "Driver's License",
        reason: "the back side is missing",
      });
      expect(out.subject).toContain("Estate of John Doe");
      expect(out.emailBody).toContain("Item: Driver's License");
      expect(out.emailBody).toContain("Reason: the back side is missing");
      expect(out.smsBody).toContain("Driver's License");
      expect(out.smsBody).toContain("the back side is missing");
    });

    it("does not leak any unresolved {placeholders}", () => {
      const out = renderReupload({ ...ctx, itemName: "Driver's License", reason: "blurry" });
      const blob = `${out.subject}\n${out.emailBody}\n${out.smsBody}`;
      expect(blob).not.toMatch(/\{[a-zA-Z]+\}/);
    });
  });

  describe("renderCompletion", () => {
    const out = renderCompletion(ctx);

    it("thanks the client for the matter", () => {
      expect(out.subject).toBe("Thank you — all documents received for Estate of John Doe");
      expect(out.smsBody).toContain("Jane Doe");
      expect(out.smsBody).toContain("Estate of John Doe");
    });

    it("does not include an upload link (job is done)", () => {
      expect(out.emailBody).not.toContain(ctx.uploadLink);
      expect(out.smsBody).not.toContain(ctx.uploadLink);
    });
  });
});
