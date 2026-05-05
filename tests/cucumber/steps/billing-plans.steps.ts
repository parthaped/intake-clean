import assert from "node:assert/strict";

import { Given, Then, When } from "@cucumber/cucumber";

import { PLANS, PLAN_BY_TIER } from "@/lib/constants";
import type { PlanTier } from "@/types/database";

import { IntakeWorld } from "./world";

const VALID_TIERS: PlanTier[] = ["starter", "solo", "firm"];

function asTier(raw: string): PlanTier {
  if ((VALID_TIERS as string[]).includes(raw)) return raw as PlanTier;
  throw new Error(`Unknown tier: ${raw}`);
}

Given("the {string} plan", function (this: IntakeWorld, tier: string) {
  this.selectedPlan = PLAN_BY_TIER[asTier(tier)];
});

Then("the matter limit is {int}", function (this: IntakeWorld, expected: number) {
  if (!this.selectedPlan) throw new Error("no plan selected");
  assert.equal(this.selectedPlan.matterLimit, expected);
});

Then("the storage limit is {int} GB", function (this: IntakeWorld, expected: number) {
  if (!this.selectedPlan) throw new Error("no plan selected");
  assert.equal(this.selectedPlan.storageGb, expected);
});

Then("storage in MB equals storage in GB times 1024", function (this: IntakeWorld) {
  if (!this.selectedPlan) throw new Error("no plan selected");
  assert.equal(this.selectedPlan.storageMb, this.selectedPlan.storageGb * 1024);
});

When("I list the plans in declared order", function (this: IntakeWorld) {
  // No-op state setup; following Then steps read PLANS directly.
});

Then("the monthly prices are strictly increasing", function () {
  for (let i = 1; i < PLANS.length; i += 1) {
    assert.ok(
      PLANS[i]!.monthlyPriceCents > PLANS[i - 1]!.monthlyPriceCents,
      `expected ${PLANS[i]!.tier} (${PLANS[i]!.monthlyPriceCents}) > ${PLANS[i - 1]!.tier} (${PLANS[i - 1]!.monthlyPriceCents})`,
    );
  }
});

Then("exactly one plan is highlighted", function () {
  const highlighted = PLANS.filter((p) => p.highlight === true);
  assert.equal(highlighted.length, 1, `expected exactly one highlighted plan, got ${highlighted.length}`);
});
