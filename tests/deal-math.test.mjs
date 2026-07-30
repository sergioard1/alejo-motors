import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DEAL_SETTINGS,
  calculateDealPricing,
  calculatePayments,
} from "../deal-math.mjs";

test("calculates the requested $5,200 example with dealer processing", () => {
  const result = calculateDealPricing({
    mode: "base",
    amount: 5200,
    includeDealerProcessingFee: true,
    settings: DEFAULT_DEAL_SETTINGS,
  });

  assert.equal(result.basePrice, 5200);
  assert.equal(result.taxAmount, 325);
  assert.equal(result.totalFees, 215);
  assert.equal(result.outTheDoor, 5740);
});

test("calculates the requested $5,200 example without dealer processing", () => {
  const result = calculateDealPricing({
    mode: "base",
    amount: 5200,
    includeDealerProcessingFee: false,
    settings: DEFAULT_DEAL_SETTINGS,
  });

  assert.equal(result.basePrice, 5200);
  assert.equal(result.taxAmount, 325);
  assert.equal(result.totalFees, 165);
  assert.equal(result.outTheDoor, 5690);
});

test("recalculates base price immediately when dealer fee changes in OTD mode", () => {
  const withFee = calculateDealPricing({
    mode: "otd",
    amount: 5740,
    includeDealerProcessingFee: true,
  });
  const withoutFee = calculateDealPricing({
    mode: "otd",
    amount: 5740,
    includeDealerProcessingFee: false,
  });

  assert.equal(withFee.basePrice, 5200);
  assert.equal(withFee.taxAmount, 325);
  assert.equal(withFee.outTheDoor, 5740);
  assert.equal(withoutFee.basePrice, 5247.06);
  assert.equal(withoutFee.taxAmount, 327.94);
  assert.equal(withoutFee.outTheDoor, 5740);
});

test("payments only reduce the balance", () => {
  const pricing = calculateDealPricing({ mode: "base", amount: 5200 });
  const payments = calculatePayments(
    [
      { type: "deposit", amount: 400 },
      { type: "payment", amount: 600 },
    ],
    pricing.outTheDoor
  );

  assert.equal(pricing.outTheDoor, 5740);
  assert.deepEqual(payments, {
    deposits: 400,
    otherPayments: 600,
    received: 1000,
    balance: 4740,
  });
});

test("rounds tax and all monetary totals to cents", () => {
  const result = calculateDealPricing({ mode: "base", amount: 2997.65 });

  assert.equal(result.taxAmount, 187.35);
  assert.equal(result.totalFees, 215);
  assert.equal(result.outTheDoor, 3400);
});
