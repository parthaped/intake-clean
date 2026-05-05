/**
 * Steps for `send-request-flow.feature`. We exercise the messaging stack
 * end-to-end without Supabase or real providers:
 *
 *   1. `planChannels` decides which channels fire (the same call the
 *      orchestrator makes from `sendRequestEmailAndSms`).
 *   2. `renderInitial` / `renderReminder` build the message bodies.
 *   3. `sendEmail` / `sendSms` run in mock mode (no env vars in tests),
 *      so we get back the same `sent_mock` results the orchestrator would
 *      persist on `client_messages`.
 *   4. `combinedStatus` rolls those per-channel results into the status
 *      written back to the `document_requests` row.
 *
 * If any of those layers regress we'll see a failure here.
 */
import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { sendEmail } from "@/lib/messaging/email";
import {
  combinedStatus,
  planChannels,
  type PreferredContact,
} from "@/lib/messaging/send-request";
import { sendSms } from "@/lib/messaging/sms";
import {
  renderInitial,
  renderReminder,
  type TemplateContext,
} from "@/lib/messaging/templates";

import { IntakeWorld } from "./world";

function fullCtx(world: IntakeWorld): TemplateContext {
  const { firmName, clientName, matterName, uploadLink } = world.templateContext;
  if (!firmName || !clientName || !matterName || !uploadLink) {
    throw new Error("templateContext is incomplete (set in Background)");
  }
  return { firmName, clientName, matterName, uploadLink };
}

function isPreferredContact(value: string): value is PreferredContact {
  return value === "email" || value === "sms" || value === "both";
}

Given(
  "the client prefers {string} and has email {string} and phone {string}",
  function (this: IntakeWorld, preferred: string, email: string, phone: string) {
    if (!isPreferredContact(preferred)) {
      throw new Error(`unknown preferred_contact: ${preferred}`);
    }
    this.client = {
      fullName: this.templateContext.clientName ?? "Jane Doe",
      // Treat the empty string used in feature tables as "no value on file".
      // The DB column is nullable; the feature can't put a literal `null`
      // in a quoted string, so we coerce here.
      email: email === "" ? null : email,
      phone: phone === "" ? null : phone,
      preferredContact: preferred,
    };
  },
);

async function dispatch(world: IntakeWorld, kind: "initial" | "reminder") {
  if (!world.client) throw new Error("client not configured for dispatch");
  // Suppress the "[mock-email]" / "[mock-sms]" console.info logs that the
  // mock branches emit so the cucumber output stays clean. We don't need to
  // assert on them here — the email/sms specs cover that.
  const originalInfo = console.info;
  console.info = () => {};
  try {
    world.channelPlan = planChannels(
      world.client.preferredContact,
      world.client.email,
      world.client.phone,
    );

    const ctx = fullCtx(world);
    const rendered = kind === "initial" ? renderInitial(ctx) : renderReminder(ctx);
    world.rendered = rendered;

    if (world.channelPlan.willSendEmail && world.client.email) {
      world.emailResult = await sendEmail({
        to: world.client.email,
        subject: rendered.subject,
        text: rendered.emailBody,
      });
    }
    if (world.channelPlan.willSendSms && world.client.phone) {
      world.smsResult = await sendSms({
        to: world.client.phone,
        body: rendered.smsBody,
      });
    }

    world.rolledUpStatus = combinedStatus(
      world.emailResult?.status,
      world.smsResult?.status,
    );
  } finally {
    console.info = originalInfo;
  }
}

When("we plan the dispatch and send the initial outreach", async function (this: IntakeWorld) {
  await dispatch(this, "initial");
});

When("we plan the dispatch and send the reminder", async function (this: IntakeWorld) {
  await dispatch(this, "reminder");
});

Then("email is sent", function (this: IntakeWorld) {
  assert.ok(this.channelPlan?.willSendEmail, "expected email to be planned");
  assert.ok(this.emailResult, "expected sendEmail to have been called");
  assert.ok(this.emailResult.ok, `sendEmail returned not-ok: ${this.emailResult.error}`);
});

Then("email is not sent", function (this: IntakeWorld) {
  assert.equal(this.channelPlan?.willSendEmail, false, "email should not have been planned");
  assert.equal(this.emailResult, undefined, "sendEmail should not have been called");
});

Then("SMS is sent", function (this: IntakeWorld) {
  assert.ok(this.channelPlan?.willSendSms, "expected SMS to be planned");
  assert.ok(this.smsResult, "expected sendSms to have been called");
  assert.ok(this.smsResult.ok, `sendSms returned not-ok: ${this.smsResult.error}`);
});

Then("SMS is not sent", function (this: IntakeWorld) {
  assert.equal(this.channelPlan?.willSendSms, false, "SMS should not have been planned");
  assert.equal(this.smsResult, undefined, "sendSms should not have been called");
});

Then(
  "the dispatch reports {string}",
  function (this: IntakeWorld, reason: string) {
    assert.equal(this.channelPlan?.reason, reason);
  },
);

Then(
  "the rolled-up request status is {string}",
  function (this: IntakeWorld, expected: string) {
    assert.equal(this.rolledUpStatus, expected);
  },
);

Then(
  "neither the email nor the SMS contains an unresolved placeholder",
  function (this: IntakeWorld) {
    if (!this.rendered) throw new Error("no rendered message");
    const blob = `${this.rendered.subject}\n${this.rendered.emailBody}\n${this.rendered.smsBody}`;
    const match = blob.match(/\{[a-zA-Z]+\}/);
    assert.equal(match, null, `unresolved placeholder ${match?.[0]} in rendered message`);
  },
);
