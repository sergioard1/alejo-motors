import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { calculatePayments } from "./deal-math.mjs";

const LETTER = [612, 792];
const COLORS = {
  navy: rgb(8 / 255, 35 / 255, 95 / 255),
  red: rgb(217 / 255, 30 / 255, 40 / 255),
  ink: rgb(32 / 255, 35 / 255, 42 / 255),
  muted: rgb(91 / 255, 98 / 255, 112 / 255),
  line: rgb(211 / 255, 215 / 255, 222 / 255),
  panel: rgb(247 / 255, 248 / 255, 250 / 255),
  white: rgb(1, 1, 1),
};

const DEALER = {
  name: "ALEJO MOTORS",
  address: "5601 E Lancaster Ave.",
  city: "Fort Worth, TX 76112",
  phone: "678-927-1739",
  email: "alejomotorstx@gmail.com",
};

export async function createSalesDocumentPdf(documentType, deal, options = {}) {
  if (!['quote', 'invoice'].includes(documentType)) {
    throw new Error("Unsupported sales PDF type.");
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage(LETTER);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pricing = deal?.pricing || {};
  const paymentTotals = calculatePayments(deal?.payments || [], pricing.outTheDoor);
  const isInvoice = documentType === "invoice";
  const documentTitle = isInvoice ? "INVOICE" : "NEGOTIATION QUOTE";
  const documentNumber = createDocumentNumber(documentType, deal);
  const totalLabel = isInvoice ? "Invoice Total" : "Quote Total";

  pdf.setTitle(`${documentTitle} ${documentNumber}`);
  pdf.setAuthor(DEALER.name);
  pdf.setSubject(`${isInvoice ? "Sales invoice" : "Vehicle negotiation quote"} for ${vehicleTitle(deal)}`);
  pdf.setCreator("Alejo Motors Deal Desk");
  pdf.setProducer("Alejo Motors Deal Desk");

  page.drawRectangle({ x: 0, y: 784, width: 612, height: 8, color: COLORS.red });
  await drawBrand(page, pdf, options.logoBytes, regular, bold);
  drawDocumentHeading(page, {
    title: documentTitle,
    number: documentNumber,
    date: formatUsDate(deal?.saleDate),
    balance: paymentTotals.balance,
    isInvoice,
    regular,
    bold,
  });
  drawDealerInformation(page, regular, bold);
  drawCustomerPanel(page, deal?.customer || {}, regular, bold);
  drawVehiclePanel(page, deal?.vehicle || {}, regular, bold);

  const lineItems = buildLineItems(deal);
  let tableY = drawLineItemTable(page, lineItems, regular, bold);
  drawText(page, "Texas sales tax is calculated on the vehicle base price only.", {
    x: 45,
    y: tableY - 16,
    font: regular,
    size: 7.5,
    color: COLORS.muted,
  });

  drawPaymentDetails(page, paymentTotals, regular, bold);
  drawTotals(page, {
    pricing,
    paymentTotals,
    totalLabel,
    regular,
    bold,
  });
  drawTermsAndSignatures(page, { isInvoice, regular, bold });

  return Buffer.from(await pdf.save());
}

function drawDocumentHeading(page, { title, number, date, balance, isInvoice, regular, bold }) {
  drawRightText(page, title, 566, 741, bold, title.length > 12 ? 20 : 28, COLORS.ink, 250);
  drawRightText(page, `# ${number}`, 566, 718, bold, 10.5, COLORS.ink, 230);
  drawRightText(page, `${isInvoice ? "Invoice" : "Quote"} Date: ${date || "-"}`, 566, 698, regular, 8.5, COLORS.muted, 230);
  drawRightText(page, isInvoice ? "Terms: Due on Receipt" : "Purpose: Vehicle Negotiation", 566, 684, regular, 8.5, COLORS.muted, 230);

  drawRightText(page, isInvoice ? "BALANCE DUE" : "CURRENT BALANCE", 566, 661, bold, 7.5, COLORS.muted, 180);
  drawRightText(page, formatMoney(balance), 566, 640, bold, 17, isInvoice ? COLORS.red : COLORS.navy, 190);
}

async function drawBrand(page, pdf, logoBytes, regular, bold) {
  if (logoBytes) {
    try {
      const logo = await pdf.embedPng(logoBytes);
      const scale = Math.min(225 / logo.width, 63 / logo.height);
      page.drawImage(logo, {
        x: 40,
        y: 712,
        width: logo.width * scale,
        height: logo.height * scale,
      });
      return;
    } catch {
      // The text brand below keeps the PDF usable if the optional image is unavailable.
    }
  }

  drawText(page, DEALER.name, {
    x: 44,
    y: 746,
    font: bold,
    size: 20,
    color: COLORS.navy,
  });
  drawText(page, "AUTOSALES", {
    x: 45,
    y: 729,
    font: bold,
    size: 8,
    color: COLORS.red,
  });
}

function drawDealerInformation(page, regular, bold) {
  drawText(page, DEALER.name, { x: 44, y: 696, font: bold, size: 9.5, color: COLORS.ink });
  [DEALER.address, DEALER.city, DEALER.phone, DEALER.email].forEach((line, index) => {
    drawText(page, line, {
      x: 44,
      y: 681 - index * 12,
      font: regular,
      size: 8.5,
      color: COLORS.muted,
    });
  });
}

function drawCustomerPanel(page, customer, regular, bold) {
  const x = 44;
  const y = 536;
  const width = 252;
  const height = 90;
  drawPanel(page, x, y, width, height, "BILL TO", bold);
  drawFittedText(page, customer.fullName || "Customer name not entered", {
    x: x + 12,
    y: y + 57,
    font: bold,
    size: 9.5,
    maxWidth: width - 24,
    color: COLORS.ink,
  });

  const addressLines = wrapText(
    regular,
    formatCustomerAddress(customer) || "Address not entered",
    8,
    width - 24
  ).slice(0, 2);
  addressLines.forEach((line, index) => {
    drawText(page, line, {
      x: x + 12,
      y: y + 43 - index * 11,
      font: regular,
      size: 8,
      color: COLORS.muted,
    });
  });
  const contact = [customer.phone, customer.email].filter(Boolean).join(" | ") || "Contact information not entered";
  drawFittedText(page, contact, {
    x: x + 12,
    y: y + 14,
    font: regular,
    size: 7.5,
    maxWidth: width - 24,
    color: COLORS.muted,
  });
}

function drawVehiclePanel(page, vehicle, regular, bold) {
  const x = 308;
  const y = 536;
  const width = 260;
  const height = 90;
  drawPanel(page, x, y, width, height, "VEHICLE", bold);
  drawFittedText(page, vehicleTitle({ vehicle }) || "Vehicle details not entered", {
    x: x + 12,
    y: y + 57,
    font: bold,
    size: 9.5,
    maxWidth: width - 24,
    color: COLORS.ink,
  });
  drawFittedText(page, `VIN: ${vehicle.vin || "-"}`, {
    x: x + 12,
    y: y + 42,
    font: regular,
    size: 8,
    maxWidth: width - 24,
    color: COLORS.muted,
  });
  const stockMiles = [
    vehicle.stockNumber ? `Stock: ${vehicle.stockNumber}` : "",
    vehicle.miles ? `Mileage: ${vehicle.miles}` : "",
  ].filter(Boolean).join(" | ") || "Stock and mileage not entered";
  drawFittedText(page, stockMiles, {
    x: x + 12,
    y: y + 28,
    font: regular,
    size: 7.5,
    maxWidth: width - 24,
    color: COLORS.muted,
  });
  const appearance = [vehicle.color, vehicle.bodyStyle].filter(Boolean).join(" | ") || "Color and body style not entered";
  drawFittedText(page, appearance, {
    x: x + 12,
    y: y + 14,
    font: regular,
    size: 7.5,
    maxWidth: width - 24,
    color: COLORS.muted,
  });
}

function drawPanel(page, x, y, width, height, title, bold) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 0.7,
  });
  drawText(page, title, {
    x: x + 12,
    y: y + height - 17,
    font: bold,
    size: 7.5,
    color: COLORS.navy,
  });
}

function buildLineItems(deal) {
  const pricing = deal?.pricing || {};
  const items = [
    { description: `${vehicleTitle(deal) || "Vehicle"} - Vehicle Price`, amount: pricing.basePrice },
    { description: "State Inspection", amount: pricing.stateInspection },
    { description: "Sticker Shipping", amount: pricing.stickerShipping },
  ];
  if (pricing.includeDealerProcessingFee !== false) {
    items.push({ description: "Dealer Processing Fee", amount: pricing.dealerProcessingFee });
  }
  items.push(
    { description: "Title, Registration & State Fees", amount: pricing.titleRegistrationFees },
    { description: "Buyer Plate Fee", amount: pricing.buyerPlateFee }
  );
  return items;
}

function drawLineItemTable(page, items, regular, bold) {
  const left = 44;
  const right = 568;
  const headerTop = 516;
  const headerHeight = 24;
  const rowHeight = 27;

  page.drawRectangle({
    x: left,
    y: headerTop - headerHeight,
    width: right - left,
    height: headerHeight,
    color: COLORS.ink,
  });
  drawText(page, "#", { x: 56, y: headerTop - 17, font: bold, size: 8, color: COLORS.white });
  drawText(page, "DESCRIPTION", { x: 78, y: headerTop - 17, font: bold, size: 8, color: COLORS.white });
  drawRightText(page, "QTY", 403, headerTop - 17, bold, 8, COLORS.white, 38);
  drawRightText(page, "RATE", 483, headerTop - 17, bold, 8, COLORS.white, 72);
  drawRightText(page, "AMOUNT", 558, headerTop - 17, bold, 8, COLORS.white, 72);

  let y = headerTop - headerHeight;
  items.forEach((item, index) => {
    const baseline = y - 18;
    drawText(page, String(index + 1), { x: 57, y: baseline, font: regular, size: 8, color: COLORS.ink });
    drawFittedText(page, item.description, {
      x: 78,
      y: baseline,
      font: regular,
      size: 8.3,
      maxWidth: 286,
      color: COLORS.ink,
    });
    drawRightText(page, "1", 403, baseline, regular, 8, COLORS.ink, 38);
    drawRightText(page, formatMoney(item.amount), 483, baseline, regular, 8, COLORS.ink, 72);
    drawRightText(page, formatMoney(item.amount), 558, baseline, bold, 8, COLORS.ink, 72);
    y -= rowHeight;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.55,
      color: COLORS.line,
    });
  });
  return y;
}

function drawPaymentDetails(page, paymentTotals, regular, bold) {
  drawText(page, "PAYMENT SUMMARY", { x: 44, y: 286, font: bold, size: 8, color: COLORS.navy });
  drawText(page, "Deposits", { x: 44, y: 264, font: regular, size: 8.5, color: COLORS.muted });
  drawRightText(page, formatMoney(paymentTotals.deposits), 270, 264, bold, 8.5, COLORS.ink, 100);
  drawText(page, "Other payments", { x: 44, y: 244, font: regular, size: 8.5, color: COLORS.muted });
  drawRightText(page, formatMoney(paymentTotals.otherPayments), 270, 244, bold, 8.5, COLORS.ink, 100);
  drawText(page, "Payments change only the balance due.", {
    x: 44,
    y: 220,
    font: regular,
    size: 7.5,
    color: COLORS.muted,
  });
}

function drawTotals(page, { pricing, paymentTotals, totalLabel, regular, bold }) {
  const left = 318;
  const right = 568;
  const rows = [
    ["Total charges", pricing.totalFees, false],
    [`Texas Sales Tax (${formatRate(pricing.taxRate)}%)`, pricing.taxAmount, false],
    [totalLabel, pricing.outTheDoor, true],
    ["Payments Received (-)", paymentTotals.received, false],
    ["Balance Due", paymentTotals.balance, true],
  ];
  let y = 286;

  rows.forEach(([label, amount, emphasized], index) => {
    const height = emphasized ? 29 : 22;
    if (emphasized) {
      page.drawRectangle({
        x: left,
        y: y - height + 8,
        width: right - left,
        height,
        color: index === rows.length - 1 ? COLORS.panel : COLORS.navy,
      });
    }
    const textColor = emphasized && index !== rows.length - 1 ? COLORS.white : COLORS.ink;
    const font = emphasized ? bold : regular;
    const size = emphasized ? 10 : 8.5;
    drawText(page, label, { x: left + 12, y, font, size, color: textColor });
    drawRightText(page, formatMoney(amount), right - 10, y, font, size, textColor, 105);
    y -= height;
  });
}

function drawTermsAndSignatures(page, { isInvoice, regular, bold }) {
  const lines = isInvoice
    ? [
        "Thank you for your business and trust in Alejo Motors.",
        "This invoice reflects the vehicle and amounts shown above. Buyer acknowledges vehicle condition at delivery.",
        "All sales are final except where otherwise required by law or stated in a signed written agreement.",
      ]
    : [
        "Negotiation quote only. This is not a purchase agreement, receipt, or proof of ownership.",
        "Pricing is based on the information shown and may be revised before the final documents are signed.",
        "A completed purchase requires signed sales documents and confirmation of all funds received.",
      ];

  drawText(page, isInvoice ? "THANK YOU" : "QUOTE NOTICE", {
    x: 44,
    y: 164,
    font: bold,
    size: 8,
    color: COLORS.navy,
  });
  lines.forEach((line, index) => {
    drawFittedText(page, line, {
      x: 44,
      y: 148 - index * 12,
      font: regular,
      size: 7.5,
      maxWidth: 524,
      color: COLORS.muted,
    });
  });

  page.drawLine({ start: { x: 44, y: 82 }, end: { x: 278, y: 82 }, thickness: 0.8, color: COLORS.ink });
  page.drawLine({ start: { x: 334, y: 82 }, end: { x: 568, y: 82 }, thickness: 0.8, color: COLORS.ink });
  drawText(page, "Customer Signature / Date", { x: 44, y: 68, font: regular, size: 7.5, color: COLORS.muted });
  drawText(page, "Dealer Representative / Date", { x: 334, y: 68, font: regular, size: 7.5, color: COLORS.muted });

  page.drawLine({ start: { x: 44, y: 38 }, end: { x: 568, y: 38 }, thickness: 0.5, color: COLORS.line });
  drawText(page, "Generated securely from the private Alejo Motors Deal Desk", {
    x: 44,
    y: 23,
    font: regular,
    size: 7,
    color: COLORS.muted,
  });
  drawRightText(page, "Page 1 of 1", 568, 23, regular, 7, COLORS.muted, 80);
}

function createDocumentNumber(type, deal) {
  const compact = String(deal?.dealNumber || deal?.id || Date.now())
    .replace(/^AM-/i, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return `${type === "invoice" ? "INV" : "QT"}-${compact}`;
}

function vehicleTitle(deal = {}) {
  return [deal.vehicle?.year, deal.vehicle?.make, deal.vehicle?.model].filter(Boolean).join(" ");
}

function formatCustomerAddress(customer = {}) {
  const stateZip = [customer.state, customer.zip].filter(Boolean).join(" ");
  return [customer.streetAddress, customer.city, stateZip].filter(Boolean).join(", ");
}

function formatUsDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRate(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\xFF]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function drawText(page, value, { x, y, font, size, color }) {
  const text = sanitizePdfText(value);
  if (!text) return;
  page.drawText(text, { x, y, font, size, color });
}

function drawRightText(page, value, xRight, y, font, size, color, maxWidth) {
  const text = sanitizePdfText(value);
  if (!text) return;
  const fittedSize = fitFontSize(font, text, size, maxWidth, 6);
  const width = font.widthOfTextAtSize(text, fittedSize);
  page.drawText(text, { x: xRight - width, y, font, size: fittedSize, color });
}

function drawFittedText(page, value, { x, y, font, size, maxWidth, color }) {
  const text = sanitizePdfText(value);
  if (!text) return;
  const fittedSize = fitFontSize(font, text, size, maxWidth, 6);
  page.drawText(text, { x, y, font, size: fittedSize, color });
}

function fitFontSize(font, text, preferredSize, maxWidth, minimumSize) {
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return size;
}

function wrapText(font, value, size, maxWidth) {
  const words = sanitizePdfText(value).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
