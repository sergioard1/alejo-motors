export const DEFAULT_DEAL_SETTINGS = Object.freeze({
  taxRate: 6.25,
  stateInspection: 25,
  stickerShipping: 10,
  dealerProcessingFee: 50,
  titleRegistrationFees: 120,
  buyerPlateFee: 10,
});

export function normalizeDealSettings(input = {}) {
  return {
    taxRate: clampNumber(input.taxRate, DEFAULT_DEAL_SETTINGS.taxRate, 0, 100),
    stateInspection: nonNegativeMoney(input.stateInspection, DEFAULT_DEAL_SETTINGS.stateInspection),
    stickerShipping: nonNegativeMoney(input.stickerShipping, DEFAULT_DEAL_SETTINGS.stickerShipping),
    dealerProcessingFee: nonNegativeMoney(
      input.dealerProcessingFee,
      DEFAULT_DEAL_SETTINGS.dealerProcessingFee
    ),
    titleRegistrationFees: nonNegativeMoney(
      input.titleRegistrationFees,
      DEFAULT_DEAL_SETTINGS.titleRegistrationFees
    ),
    buyerPlateFee: nonNegativeMoney(input.buyerPlateFee, DEFAULT_DEAL_SETTINGS.buyerPlateFee),
  };
}

export function calculateDealPricing({
  mode = "base",
  amount = 0,
  includeDealerProcessingFee = true,
  settings = DEFAULT_DEAL_SETTINGS,
} = {}) {
  const cleanSettings = normalizeDealSettings(settings);
  const amountCents = moneyToCents(amount);
  const fixedFeeCents =
    moneyToCents(cleanSettings.stateInspection) +
    moneyToCents(cleanSettings.stickerShipping) +
    moneyToCents(cleanSettings.titleRegistrationFees) +
    moneyToCents(cleanSettings.buyerPlateFee) +
    (includeDealerProcessingFee ? moneyToCents(cleanSettings.dealerProcessingFee) : 0);

  let baseCents = 0;
  let taxCents = 0;
  let outTheDoorCents = 0;

  if (mode === "otd") {
    outTheDoorCents = Math.max(0, amountCents);
    const subtotalCents = Math.max(0, outTheDoorCents - fixedFeeCents);
    baseCents = Math.max(
      0,
      Math.round(subtotalCents / (1 + cleanSettings.taxRate / 100))
    );
    taxCents = Math.max(0, subtotalCents - baseCents);
  } else {
    baseCents = Math.max(0, amountCents);
    taxCents = calculateTaxCents(baseCents, cleanSettings.taxRate);
    outTheDoorCents = baseCents + taxCents + fixedFeeCents;
  }

  return {
    mode: mode === "otd" ? "otd" : "base",
    inputAmount: centsToMoney(amountCents),
    includeDealerProcessingFee: Boolean(includeDealerProcessingFee),
    taxRate: cleanSettings.taxRate,
    basePrice: centsToMoney(baseCents),
    taxAmount: centsToMoney(taxCents),
    stateInspection: cleanSettings.stateInspection,
    stickerShipping: cleanSettings.stickerShipping,
    dealerProcessingFee: includeDealerProcessingFee ? cleanSettings.dealerProcessingFee : 0,
    titleRegistrationFees: cleanSettings.titleRegistrationFees,
    buyerPlateFee: cleanSettings.buyerPlateFee,
    totalFees: centsToMoney(fixedFeeCents),
    outTheDoor: centsToMoney(outTheDoorCents),
  };
}

export function calculatePayments(payments = [], outTheDoor = 0) {
  const totals = payments.reduce(
    (result, payment) => {
      const amountCents = moneyToCents(payment?.amount);
      if (String(payment?.type || "").toLowerCase() === "deposit") {
        result.depositCents += amountCents;
      } else {
        result.paymentCents += amountCents;
      }
      return result;
    },
    { depositCents: 0, paymentCents: 0 }
  );
  const receivedCents = totals.depositCents + totals.paymentCents;

  return {
    deposits: centsToMoney(totals.depositCents),
    otherPayments: centsToMoney(totals.paymentCents),
    received: centsToMoney(receivedCents),
    balance: centsToMoney(Math.max(0, moneyToCents(outTheDoor) - receivedCents)),
  };
}

export function moneyToCents(value) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : 0;
}

export function centsToMoney(value) {
  return Math.round(Number(value) || 0) / 100;
}

function calculateTaxCents(baseCents, taxRate) {
  return Math.round((baseCents * taxRate) / 100);
}

function nonNegativeMoney(value, fallback) {
  return centsToMoney(Math.max(0, moneyToCents(value ?? fallback)));
}

function clampNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
