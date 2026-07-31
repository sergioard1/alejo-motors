import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { calculateDealPricing, calculatePayments } from "../deal-math.mjs";
import { createSalesDocumentPdf } from "../sales-documents.mjs";

function sampleDeal(includeDealerProcessingFee) {
  const pricing = calculateDealPricing({
    mode: "base",
    amount: 5200,
    includeDealerProcessingFee,
  });
  const payments = [
    { id: "deposit", type: "deposit", amount: 500, date: "2026-07-31" },
  ];
  return {
    id: "sample",
    dealNumber: "AM-20260731-SAMPLE",
    saleDate: "2026-07-31",
    vehicle: {
      year: "2016",
      make: "Acura",
      model: "MDX",
      vin: "5FRYD4H42GB027913",
      stockNumber: "A-1027",
      miles: "118,450 miles",
      color: "Black",
      bodyStyle: "SUV",
    },
    customer: {
      fullName: "Sample Customer",
      streetAddress: "123 Main Street",
      city: "Fort Worth",
      state: "TX",
      zip: "76112",
      phone: "817-555-0123",
      email: "customer@example.com",
    },
    pricing,
    payments,
    paymentTotals: calculatePayments(payments, pricing.outTheDoor),
  };
}

test("creates a one-page letter invoice PDF with Alejo Motors metadata", async () => {
  const bytes = await createSalesDocumentPdf("invoice", sampleDeal(true));
  const pdf = await PDFDocument.load(bytes);
  const [page] = pdf.getPages();

  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  assert.equal(pdf.getAuthor(), "ALEJO MOTORS");
  assert.match(pdf.getTitle(), /^INVOICE INV-/);
});

test("creates a one-page quote with dealer processing disabled", async () => {
  const deal = sampleDeal(false);
  const bytes = await createSalesDocumentPdf("quote", deal);
  const pdf = await PDFDocument.load(bytes);

  assert.equal(deal.pricing.totalFees, 165);
  assert.equal(deal.pricing.outTheDoor, 5690);
  assert.equal(pdf.getPageCount(), 1);
  assert.match(pdf.getTitle(), /^QUOTE QT-/);
});

test("rejects unknown client PDF types", async () => {
  await assert.rejects(() => createSalesDocumentPdf("unknown", sampleDeal(true)));
});
