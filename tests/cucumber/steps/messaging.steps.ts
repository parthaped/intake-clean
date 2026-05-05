import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import {
  renderCompletion,
  renderInitial,
  renderReminder,
  renderReupload,
  type TemplateContext,
} from "@/lib/messaging/templates";

import { IntakeWorld } from "./world";

function fullCtx(world: IntakeWorld): TemplateContext {
  const { firmName, clientName, matterName, uploadLink, itemName, reason } = world.templateContext;
  if (!firmName || !clientName || !matterName || !uploadLink) {
    throw new Error("templateContext is incomplete");
  }
  return { firmName, clientName, matterName, uploadLink, itemName, reason };
}

Given(
  "the firm {string} is requesting documents from {string} for matter {string}",
  function (this: IntakeWorld, firm: string, client: string, matter: string) {
    this.templateContext = {
      ...this.templateContext,
      firmName: firm,
      clientName: client,
      matterName: matter,
    };
  },
);

Given("the upload link is {string}", function (this: IntakeWorld, link: string) {
  this.templateContext.uploadLink = link;
});

When("we render the initial outreach message", function (this: IntakeWorld) {
  this.rendered = renderInitial(fullCtx(this));
});

When("we render the reminder message", function (this: IntakeWorld) {
  this.rendered = renderReminder(fullCtx(this));
});

When(
  "we render a re-upload request for {string} because {string}",
  function (this: IntakeWorld, item: string, reason: string) {
    this.templateContext.itemName = item;
    this.templateContext.reason = reason;
    this.rendered = renderReupload(fullCtx(this));
  },
);

When("we render the completion message", function (this: IntakeWorld) {
  this.rendered = renderCompletion(fullCtx(this));
});

Then("the email subject is {string}", function (this: IntakeWorld, expected: string) {
  if (!this.rendered) throw new Error("no rendered message");
  assert.equal(this.rendered.subject, expected);
});

Then("the email body greets the client by name", function (this: IntakeWorld) {
  if (!this.rendered) throw new Error("no rendered message");
  const client = this.templateContext.clientName ?? "";
  assert.ok(
    this.rendered.emailBody.startsWith(`Hi ${client},`),
    `expected email to start with greeting; got:\n${this.rendered.emailBody}`,
  );
});

Then(
  "the email body and SMS body both contain the upload link",
  function (this: IntakeWorld) {
    if (!this.rendered) throw new Error("no rendered message");
    const link = this.templateContext.uploadLink ?? "";
    assert.ok(this.rendered.emailBody.includes(link), "email body missing upload link");
    assert.ok(this.rendered.smsBody.includes(link), "sms body missing upload link");
  },
);

Then(
  "the email body and SMS body both omit the upload link",
  function (this: IntakeWorld) {
    if (!this.rendered) throw new Error("no rendered message");
    const link = this.templateContext.uploadLink ?? "";
    assert.ok(!this.rendered.emailBody.includes(link), "email body unexpectedly includes upload link");
    assert.ok(!this.rendered.smsBody.includes(link), "sms body unexpectedly includes upload link");
  },
);

Then("the email body contains {string}", function (this: IntakeWorld, fragment: string) {
  if (!this.rendered) throw new Error("no rendered message");
  assert.ok(
    this.rendered.emailBody.includes(fragment),
    `expected email body to contain ${JSON.stringify(fragment)}`,
  );
});

Then("the SMS body contains {string}", function (this: IntakeWorld, fragment: string) {
  if (!this.rendered) throw new Error("no rendered message");
  assert.ok(
    this.rendered.smsBody.includes(fragment),
    `expected SMS body to contain ${JSON.stringify(fragment)}`,
  );
});

Then("no message contains an unresolved placeholder", function (this: IntakeWorld) {
  if (!this.rendered) throw new Error("no rendered message");
  const blob = `${this.rendered.subject}\n${this.rendered.emailBody}\n${this.rendered.smsBody}`;
  const match = blob.match(/\{[a-zA-Z]+\}/);
  assert.equal(match, null, `unresolved placeholder ${match?.[0]} found in rendered message`);
});
