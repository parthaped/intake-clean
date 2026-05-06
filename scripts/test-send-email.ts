/**
 * One-off live Resend smoke test for `sendEmail` + `renderInitial`.
 *
 * Loads `.env.local`, runs the same code path the dispatch orchestrator uses
 * for an "initial outreach" email, and prints the structured result so we can
 * confirm whether Resend accepted the send (status === "sent" with a
 * provider message id) or fell back to mock/failed mode.
 *
 * Usage: tsx scripts/test-send-email.ts <recipient-email>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

loadDotEnv(resolve(process.cwd(), ".env.local"));

async function main(): Promise<void> {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error("usage: tsx scripts/test-send-email.ts <recipient-email>");
    process.exit(2);
  }

  const { sendEmail } = await import("@/lib/messaging/email");
  const { renderInitial } = await import("@/lib/messaging/templates");
  const { integrations, env } = await import("@/lib/env");

  console.log("[config]", {
    hasResend: integrations.hasResend,
    from: env.resendFromEmail,
    to: recipient,
    appUrl: env.appUrl,
  });

  const message = renderInitial({
    firmName: "Acme Law (IntakeClean smoke test)",
    clientName: "Jane Doe",
    matterName: "Estate of John Doe",
    uploadLink: `${env.appUrl}/upload/smoke-test-token`,
  });

  const result = await sendEmail({
    to: recipient,
    subject: message.subject,
    text: message.emailBody,
  });

  console.log("[result]", result);

  if (result.status === "sent") {
    console.log("OK: Resend accepted the message.");
    process.exit(0);
  }
  if (result.status === "sent_mock") {
    console.warn(
      "WARN: ran in mock mode — RESEND_API_KEY was not picked up from the env.",
    );
    process.exit(1);
  }
  console.error("FAIL: Resend rejected the message:", result.error);
  process.exit(1);
}

main().catch((err) => {
  console.error("[unhandled]", err);
  process.exit(1);
});
