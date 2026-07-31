import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { calculateDealPricing, calculatePayments } from "../deal-math.mjs";
import {
  createBuyersGuidePdf,
  createCashPurchaseAgreementPdf,
} from "../client-documents.mjs";

function sampleDeal() {
  const pricing = calculateDealPricing({
    mode: "base",
    amount: 5200,
    includeDealerProcessingFee: true,
  });
  const payments = [{ id: "deposit", type: "deposit", amount: 500, date: "2026-07-31", note: "CASH" }];
  return {
    id: "sample",
    dealNumber: "AM-20260731-SAMPLE",
    saleDate: "2026-07-31",
    vehicle: {
      year: "2016",
      make: "ACURA",
      model: "MDX",
      vin: "5FRYD4H42GB027913",
      stockNumber: "A-1027",
      miles: "118450",
      color: "BLACK",
      bodyStyle: "SUV",
    },
    customer: {
      fullName: "SAMPLE CUSTOMER",
      streetAddress: "123 MAIN STREET",
      city: "FORT WORTH",
      state: "TX",
      zip: "76112",
      phone: "817-555-0123",
      email: "customer@example.com",
      identificationType: "U.S. Driver License/ID Card",
      identificationNumber: "12345678",
      identificationState: "TX",
    },
    pricing,
    payments,
    paymentTotals: calculatePayments(payments, pricing.outTheDoor),
  };
}

test("creates a portable letter-size cash purchase agreement PDF", async () => {
  const bytes = await createCashPurchaseAgreementPdf(sampleDeal());
  const pdf = await PDFDocument.load(bytes);

  assert.ok(pdf.getPageCount() >= 2);
  pdf.getPages().forEach((page) => assert.deepEqual(page.getSize(), { width: 612, height: 792 }));
  assert.match(pdf.getTitle(), /^VEHICLE PURCHASE AGREEMENT AM-/);
  assert.equal(pdf.getAuthor(), "ALEJO MOTORS");
});

test("creates a flattened two-page AS IS Buyers Guide", async () => {
  const template = readFileSync(new URL("../assets/dealer-documents/buyers-guide-english.pdf", import.meta.url));
  const bytes = await createBuyersGuidePdf(sampleDeal(), template);
  const pdf = await PDFDocument.load(bytes);

  assert.equal(pdf.getPageCount(), 2);
  assert.match(pdf.getTitle(), /^BUYERS GUIDE - AS IS -/);
  assert.equal(pdf.getForm().getFields().length, 0);
});
