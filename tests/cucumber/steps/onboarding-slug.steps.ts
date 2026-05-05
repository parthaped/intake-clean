import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { slugify } from "@/lib/utils";

import { IntakeWorld } from "./world";

Given("a firm named {string}", function (this: IntakeWorld, name: string) {
  this.firmName = name;
});

When("the firm is onboarded", function (this: IntakeWorld) {
  if (this.firmName === undefined) throw new Error("firmName not set");
  this.slug = slugify(this.firmName);
});

Then("the generated slug is {string}", function (this: IntakeWorld, expected: string) {
  assert.equal(this.slug, expected);
});
