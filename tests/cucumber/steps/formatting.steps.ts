import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { formatBytes, initials, truncate } from "@/lib/utils";

import { IntakeWorld } from "./world";

Given("an uploaded file of {int} bytes", function (this: IntakeWorld, bytes: number) {
  this.bytes = bytes;
});

Given("an uploaded file with a non-finite size", function (this: IntakeWorld) {
  this.bytes = Number.NaN;
});

When("the dashboard renders its size", function (this: IntakeWorld) {
  if (this.bytes === undefined) throw new Error("bytes not set");
  this.formattedSize = formatBytes(this.bytes);
});

Then("the formatted size is {string}", function (this: IntakeWorld, expected: string) {
  assert.equal(this.formattedSize, expected);
});

Given("a profile with no full name", function (this: IntakeWorld) {
  this.fullName = null;
});

Given("a profile named {string}", function (this: IntakeWorld, name: string) {
  this.fullName = name;
});

When("we render the avatar initials", function (this: IntakeWorld) {
  this.initialsValue = initials(this.fullName);
});

Then("the initials are {string}", function (this: IntakeWorld, expected: string) {
  assert.equal(this.initialsValue, expected);
});

Given("the matter name {string}", function (this: IntakeWorld, name: string) {
  this.matterName = name;
});

When(
  "we truncate it to {int} characters",
  function (this: IntakeWorld, max: number) {
    if (this.matterName === undefined) throw new Error("matterName not set");
    this.truncated = truncate(this.matterName, max);
  },
);

Then(
  "the displayed name has length {int}",
  function (this: IntakeWorld, expected: number) {
    if (this.truncated === undefined) throw new Error("truncated not set");
    assert.equal(this.truncated.length, expected);
  },
);

Then("the displayed name ends with {string}", function (this: IntakeWorld, suffix: string) {
  if (this.truncated === undefined) throw new Error("truncated not set");
  assert.ok(
    this.truncated.endsWith(suffix),
    `expected ${JSON.stringify(this.truncated)} to end with ${JSON.stringify(suffix)}`,
  );
});
