import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { calculatePayments } from "./deal-math.mjs";

const LETTER = [612, 792];
const COLORS = {
  navy: rgb(11 / 255, 44 / 255, 85 / 255),
  ink: rgb(25 / 255, 29 / 255, 35 / 255),
  muted: rgb(91 / 255, 101 / 255, 115 / 255),
  line: rgb(202 / 255, 208 / 255, 216 / 255),
  panel: rgb(246 / 255, 248 / 255, 251 / 255),
  white: rgb(1, 1, 1),
};

export const DEALER_DOCUMENT_INFORMATION = {
  name: "ALEJO MOTORS",
  representative: "SERGIO RODRIGUEZ",
  representativeTitle: "AUTHORIZED REPRESENTATIVE",
  address: "5601 E LANCASTER AVE., FORT WORTH, TX 76112",
  gdn: "GDN P170814",
  phone: "678-927-1739",
  email: "alejomotorstx@gmail.com",
};

const AGREEMENT_SECTIONS = [
  {
    heading: "2. FINAL PRICE, INVOICE, PAYMENT METHOD, AND TRADE-IN",
    paragraphs: [
      "The separate invoice is incorporated into this agreement and contains the agreed itemization of the vehicle price, taxes, title and registration charges, documentary fee if any, trade-in credit, payments, and final balance. If a mathematical difference exists, the signed invoice controls only as to the itemized calculation; this agreement controls the parties' non-price terms. Buyer must review the invoice before signing and immediately identify any error.",
      "All funds must be verified, irrevocably received, and cleared before delivery unless Seller expressly agrees otherwise in a separate legally compliant writing. A returned check, reversed electronic payment, chargeback, counterfeit instrument, or rejected transfer does not constitute payment and does not convert this agreement into financing. Buyer remains liable for the unpaid amount, lawful returned-payment charges, collection costs recoverable by law, and any other available remedy.",
      "This is a cash transaction, not a retail installment contract. Seller does not agree to extend credit, accept deferred installments, or permit Buyer to pay the balance over time.",
    ],
  },
  {
    heading: "3. TRADE-IN REPRESENTATIONS, IF APPLICABLE",
    paragraphs: [
      "If Buyer provides a trade-in, Buyer represents that Buyer is the lawful owner or authorized transferor; the VIN, odometer reading, title status, lien information, and payoff information supplied to Seller are complete and accurate; the trade-in has not been sold, pledged, hidden, materially damaged after appraisal, or subjected to an undisclosed lien; and Buyer will promptly sign all documents reasonably necessary to transfer good title. Any trade-in allowance is conditioned on verification of title, physical condition, mileage, payoff, and lien status.",
      "If the actual lien payoff exceeds the amount used on the invoice, Buyer must pay the difference upon demand. If it is lower, Seller will credit or refund the verified difference as applicable. Seller may cancel the transaction before delivery if Buyer cannot convey lawful title to the trade-in, materially misstates its condition or payoff, or removes equipment or causes material damage after appraisal. These remedies do not limit rights that cannot legally be waived.",
    ],
  },
  {
    heading: "4. TITLE, REGISTRATION, TAXES, AND BUYER COOPERATION",
    paragraphs: [
      "Seller will collect and remit applicable motor vehicle sales tax and submit the documents required for Texas title and registration within 30 calendar days after the sale, or within another period specifically permitted by Texas law. Buyer authorizes Seller to correct non-material clerical errors in title or registration paperwork, but not the agreed selling price, vehicle, or substantive terms without Buyer's written consent.",
      "Buyer must timely provide valid identification, signatures, payment, lien or trade-in documents, and any other information reasonably required to complete the transaction. Buyer is responsible only for additional costs or delay directly caused by Buyer's failure to cooperate; Seller remains responsible for its non-waivable legal duties.",
    ],
  },
  {
    heading: "5. VEHICLE CONDITION — AS IS / FTC BUYERS GUIDE",
    paragraphs: [
      "AS IS — NO DEALER WARRANTY",
      "Unless the FTC Buyers Guide for this vehicle states that a dealer warranty applies, Buyer purchases the vehicle AS IS, with all faults and without a dealer warranty. To the extent permitted by law, Seller disclaims implied warranties, including merchantability and fitness for a particular purpose. This clause does not waive fraud, a written promise, a warranty shown on the Buyers Guide, or any right that cannot legally be waived.",
      "The FTC Buyers Guide displayed on the vehicle and provided to Buyer is incorporated into this agreement. If the Buyers Guide states that a dealer warranty applies, the Buyers Guide controls over inconsistent language in this agreement. Spoken promises are not binding unless written in this agreement, the Buyers Guide, or a separate signed document.",
      "Buyer had the opportunity to inspect and test-drive the vehicle and may obtain an independent mechanical inspection. Normal wear, cosmetic damage, prior repairs, and future maintenance needs may exist in a used vehicle. Buyer's acceptance does not excuse Seller from accurately disclosing title brands, odometer status, or written promises.",
    ],
  },
  {
    heading: "6. DELIVERY, POSSESSION, INSURANCE, AND RISK AFTER DELIVERY",
    paragraphs: [
      "Ownership documents will be processed as required by law. Possession and responsibility for the vehicle transfer to Buyer upon physical delivery after payment has cleared. From delivery, Buyer is responsible for maintaining insurance and for lawful operation, maintenance, tolls, citations, accidents, damage to third parties, and use of the vehicle, except for obligations that cannot legally be waived or that Seller expressly accepts in writing.",
      "Buyer must remove all personal property from any trade-in and inspect the purchased vehicle for personal property at delivery. Seller is not responsible for property left in a traded or delivered vehicle except to the extent responsibility cannot legally be waived. Buyer will not operate the vehicle without legally required insurance and a valid license.",
    ],
  },
  {
    heading: "7. CANCELLATION, FINAL SALE, AND LIMITED REFUND RIGHTS",
    paragraphs: [
      "AFTER DELIVERY. After verified payment, Buyer's acceptance, and physical delivery, the sale is final. Texas generally does not provide a three-day right to cancel a dealership vehicle purchase. There is no return, exchange, cooling-off period, or refund based on changed mind, inability to obtain later financing, dissatisfaction with fuel economy, comfort, appearance, ordinary wear, or a condition covered by the AS IS terms, unless Seller expressly agrees in writing or applicable law requires a remedy. Nothing here eliminates a written warranty, a Buyers Guide obligation, fraud claim, title duty, or other right that cannot legally be waived.",
    ],
  },
  {
    heading: "8. BUYER INSPECTION, NO RELIANCE, AND ACCEPTANCE",
    paragraphs: [
      "Buyer confirms that Buyer had sufficient opportunity to inspect, test-drive, scan, research, and obtain an independent inspection of the vehicle; reviewed the VIN, mileage, title brand, invoice, FTC Buyers Guide, visible condition, warning indicators; and is relying on Buyer's own evaluation and the written documents, not on an unwritten statement about condition, reliability, remaining life, fuel economy, future value, suitability, or repair cost. Buyer's decision not to obtain an independent inspection is voluntary and does not create a dealer warranty.",
      "No employee or agent may alter the AS IS status, promise a refund, extend a warranty, or authorize a repair unless the commitment is written and signed by an authorized Alejo Motors representative. Estimates, courtesy assistance, diagnostic opinions, advertisements, and statements of belief are not guarantees unless expressly incorporated into a signed writing.",
    ],
  },
  {
    heading: "9. ENTIRE AGREEMENT, INTERPRETATION, NOTICES, AND ENFORCEABILITY",
    paragraphs: [
      "This agreement, the signed invoice, FTC Buyers Guide, and any separate written promise signed by an authorized dealer representative constitute the parties' complete agreement concerning this sale. They replace prior discussions, texts, advertisements, negotiations, and oral statements to the extent permitted by law. A modification or waiver must be in a writing signed by the party against whom it is asserted. A delay in enforcing a right is not a permanent waiver.",
      "Texas law governs. Any provision found invalid or unenforceable will be limited or severed only to the minimum extent necessary, and the remaining provisions will continue. Headings are for organization and do not limit the text. Singular and plural terms include each other as context requires. Electronic signatures and counterparts may be treated as originals to the extent permitted by law. Notices concerning cancellation or a written promise must identify the Buyer, vehicle VIN, agreement number, reason, and requested action and must be delivered to Alejo Motors at the address shown above or another address Seller designates in writing.",
    ],
  },
];

export async function createCashPurchaseAgreementPdf(deal = {}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const context = {
    pdf,
    regular,
    bold,
    oblique,
    pages: [],
    page: null,
    y: 0,
    deal,
  };

  addAgreementPage(context, true);
  drawAgreementIdentity(context);
  drawSectionHeading(context, "1. VEHICLE");
  drawVehicleFields(context);
  drawParagraph(
    context,
    "*A salvage or nonrepairable vehicle may not be represented as road-ready and requires separate legally appropriate documentation.",
    { font: oblique, size: 7.2, lineHeight: 9.4, color: COLORS.muted, gapAfter: 7 }
  );
  drawSectionHeading(context, AGREEMENT_SECTIONS[0].heading);
  drawPriceAndPaymentFields(context);
  AGREEMENT_SECTIONS[0].paragraphs.forEach((paragraph) => drawParagraph(context, paragraph));

  AGREEMENT_SECTIONS.slice(1).forEach((section) => {
    drawSectionHeading(context, section.heading);
    section.paragraphs.forEach((paragraph, index) => {
      const isAsIsLine = section.heading.startsWith("5.") && index === 0;
      drawParagraph(context, paragraph, isAsIsLine ? { font: bold, color: COLORS.navy } : {});
    });
  });

  drawSectionHeading(context, "10. DOCUMENTS RECEIVED AND FINAL ACKNOWLEDGMENTS");
  drawDocumentsReceived(context);
  drawParagraph(
    context,
    "Buyer confirms that all material blanks were completed or marked N/A before signing, received a completed copy of this agreement, had the opportunity to ask questions, and understands that this agreement is binding when signed and accepted by Seller.",
    { gapAfter: 10 }
  );
  drawSignatures(context);
  drawAgreementFooters(context);

  const agreementNumber = safeText(deal.dealNumber || deal.id || "AGREEMENT");
  pdf.setTitle(`VEHICLE PURCHASE AGREEMENT ${agreementNumber}`);
  pdf.setAuthor(DEALER_DOCUMENT_INFORMATION.name);
  pdf.setSubject(`Cash vehicle purchase agreement for ${vehicleTitle(deal)}`);
  pdf.setCreator("Alejo Motors Deal Desk");
  pdf.setProducer("Alejo Motors Deal Desk");
  return Buffer.from(await pdf.save());
}

export async function createBuyersGuidePdf(deal = {}, templateBytes) {
  if (!templateBytes) throw new Error("Buyers Guide template is unavailable.");

  const source = await PDFDocument.load(templateBytes);
  const form = source.getForm();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const prefix = "topmostSubform[0].BG-AsIs[0].";
  const backPrefix = "topmostSubform[0].BG-Back[0].";

  setFormText(form, `${prefix}VehicleMake[0]`, deal.vehicle?.make, 10);
  setFormText(form, `${prefix}Model[0]`, deal.vehicle?.model, 10);
  setFormText(form, `${prefix}Year[0]`, deal.vehicle?.year, 10);
  setFormText(form, `${prefix}VIN[0]`, deal.vehicle?.vin, 9);
  try {
    form.getRadioGroup(`${prefix}Warranty[0]`).select("As Is");
  } catch {
    throw new Error("The official Buyers Guide AS IS field could not be selected.");
  }

  setFormText(form, `${backPrefix}DealerName[0]`, DEALER_DOCUMENT_INFORMATION.name, 10);
  setFormText(
    form,
    `${backPrefix}DealerAddress[0]`,
    `${DEALER_DOCUMENT_INFORMATION.address} | ${DEALER_DOCUMENT_INFORMATION.gdn}`,
    8.5
  );
  setFormText(form, `${backPrefix}DealerPhone[0]`, DEALER_DOCUMENT_INFORMATION.phone, 10);
  setFormText(form, `${backPrefix}DealerEmail[0]`, DEALER_DOCUMENT_INFORMATION.email, 9);
  setFormText(
    form,
    `${backPrefix}ComplaintContact[0]`,
    `${DEALER_DOCUMENT_INFORMATION.representative} | ${DEALER_DOCUMENT_INFORMATION.phone} | ${DEALER_DOCUMENT_INFORMATION.email}`,
    8.5
  );

  form.updateFieldAppearances(font);
  form.flatten();

  const output = await PDFDocument.create();
  const flattenedSource = await source.save();
  const [front, back] = await output.embedPdf(flattenedSource, [0, 2]);
  [front, back].forEach((embeddedPage) => {
    const page = output.addPage(LETTER);
    page.drawPage(embeddedPage, { x: 0, y: 0, width: LETTER[0], height: LETTER[1] });
  });
  output.setTitle(`BUYERS GUIDE - AS IS - ${safeText(deal.vehicle?.vin || deal.dealNumber)}`);
  output.setAuthor(DEALER_DOCUMENT_INFORMATION.name);
  output.setSubject(`FTC Buyers Guide - AS IS - NO DEALER WARRANTY for ${vehicleTitle(deal)}`);
  output.setCreator("Alejo Motors Deal Desk");
  output.setProducer("Alejo Motors Deal Desk");
  return Buffer.from(await output.save());
}

function addAgreementPage(context, firstPage = false) {
  const page = context.pdf.addPage(LETTER);
  context.pages.push(page);
  context.page = page;
  page.drawRectangle({ x: 0, y: 786, width: 612, height: 6, color: COLORS.navy });
  page.drawText(DEALER_DOCUMENT_INFORMATION.name, {
    x: 42,
    y: 760,
    font: context.bold,
    size: firstPage ? 15 : 10,
    color: COLORS.navy,
  });
  page.drawText(
    `${DEALER_DOCUMENT_INFORMATION.address} | ${DEALER_DOCUMENT_INFORMATION.gdn} | ${DEALER_DOCUMENT_INFORMATION.phone}`,
    { x: 42, y: firstPage ? 744 : 746, font: context.regular, size: 7.2, color: COLORS.muted }
  );
  if (!firstPage) {
    drawRightText(
      page,
      safeText(context.deal.dealNumber || context.deal.id),
      570,
      760,
      context.bold,
      8,
      COLORS.navy
    );
  }
  if (firstPage) {
    page.drawText("VEHICLE PURCHASE AGREEMENT", {
      x: 42,
      y: 710,
      font: context.bold,
      size: 15,
      color: COLORS.navy,
    });
    page.drawText("CASH VEHICLE PURCHASE / BUYER'S ORDER", {
      x: 42,
      y: 695,
      font: context.bold,
      size: 7.5,
      color: COLORS.muted,
    });
    context.y = 674;
  } else {
    context.y = 724;
  }
}

function drawAgreementIdentity(context) {
  const { deal } = context;
  const customer = deal.customer || {};
  drawKeyValueRows(context, [
    ["Agreement / stock no.", `${safeText(deal.dealNumber || deal.id)} / ${safeText(deal.vehicle?.stockNumber) || "N/A"}`],
    ["Sale date", formatUsDate(deal.saleDate)],
    ["Buyer legal name", safeText(customer.fullName)],
    ["Address", formatCustomerAddress(customer)],
    ["Phone / email", [customer.phone, customer.email].filter(Boolean).join(" | ")],
    ["Government-issued ID", formatIdentification(customer)],
  ]);
}

function drawVehicleFields(context) {
  const vehicle = context.deal.vehicle || {};
  drawKeyValueRows(context, [
    ["Year / make / model", vehicleTitle(context.deal)],
    ["VIN", safeText(vehicle.vin)],
    ["Color / body style", [vehicle.color, vehicle.bodyStyle].filter(Boolean).join(" / ")],
    ["Odometer", `${formatOdometer(vehicle.miles)}   [ ] Actual   [ ] Not actual   [ ] Exceeds mechanical limits`],
    ["Title brand", "[ ] Clean   [ ] Rebuilt   [ ] Salvage*   [ ] Other: ____________________"],
  ]);
}

function drawPriceAndPaymentFields(context) {
  const { deal } = context;
  const pricing = deal.pricing || {};
  const payments = calculatePayments(deal.payments || [], pricing.outTheDoor);
  const references = (deal.payments || [])
    .map((payment) => safeText(payment.note))
    .filter(Boolean)
    .join(" | ");
  drawKeyValueRows(context, [
    ["Final price", `${formatMoney(pricing.outTheDoor)}   Invoice no.: ${createInvoiceNumber(deal)}`],
    ["Payment method", "[X] Cash   [ ] Cashier's check   [ ] Money order   [ ] Electronic   [ ] Card   [ ] Other"],
    ["Payment reference", references || "N/A"],
    ["Payments / balance", `${formatMoney(payments.received)} received   |   ${formatMoney(payments.balance)} balance`],
    ["Trade-in", "[X] None   [ ] Yes — Year/make/model: ______________________________"],
    ["Trade-in VIN / allowance", "N/A"],
    ["Trade-in payoff", "[X] No lien / N/A"],
  ]);
}

function drawKeyValueRows(context, rows) {
  const height = 19;
  ensureSpace(context, rows.length * height + 5);
  const x = 42;
  const width = 528;
  const labelWidth = 122;

  rows.forEach(([label, value], index) => {
    const y = context.y - height;
    context.page.drawRectangle({
      x,
      y,
      width,
      height,
      color: index % 2 === 0 ? COLORS.panel : COLORS.white,
      borderColor: COLORS.line,
      borderWidth: 0.45,
    });
    context.page.drawText(label, {
      x: x + 7,
      y: y + 6,
      font: context.bold,
      size: 7,
      color: COLORS.navy,
    });
    drawFittedText(context.page, safeText(value) || "N/A", {
      x: x + labelWidth,
      y: y + 5.5,
      font: context.regular,
      preferredSize: 7.4,
      minimumSize: 5.8,
      maxWidth: width - labelWidth - 8,
      color: COLORS.ink,
    });
    context.y = y;
  });
  context.y -= 7;
}

function drawSectionHeading(context, heading) {
  ensureSpace(context, 32);
  context.y -= 5;
  context.page.drawRectangle({ x: 42, y: context.y - 16, width: 528, height: 18, color: COLORS.navy });
  context.page.drawText(heading, {
    x: 49,
    y: context.y - 10.5,
    font: context.bold,
    size: heading.length > 60 ? 7.3 : 8.2,
    color: COLORS.white,
  });
  context.y -= 23;
}

function drawParagraph(context, text, options = {}) {
  const font = options.font || context.regular;
  const size = options.size || 7.6;
  const lineHeight = options.lineHeight || 10.1;
  const color = options.color || COLORS.ink;
  const gapAfter = options.gapAfter ?? 6;
  const lines = wrapText(font, text, size, 528);
  let index = 0;

  while (index < lines.length) {
    if (context.y - lineHeight < 48) addAgreementPage(context);
    context.page.drawText(lines[index], {
      x: 42,
      y: context.y,
      font,
      size,
      color,
    });
    context.y -= lineHeight;
    index += 1;
  }
  context.y -= gapAfter;
}

function drawDocumentsReceived(context) {
  ensureSpace(context, 46);
  drawCheckboxLine(context, 42, context.y, false, "Signed invoice with price itemization");
  drawCheckboxLine(context, 290, context.y, false, "FTC Buyers Guide received");
  context.y -= 20;
  drawCheckboxLine(context, 290, context.y, true, "English");
  drawCheckboxLine(context, 400, context.y, false, "Spanish");
  context.y -= 18;
}

function drawCheckboxLine(context, x, y, checked, label) {
  context.page.drawRectangle({
    x,
    y: y - 7,
    width: 9,
    height: 9,
    borderColor: COLORS.ink,
    borderWidth: 0.8,
  });
  if (checked) {
    context.page.drawText("X", { x: x + 1.7, y: y - 5.7, font: context.bold, size: 7, color: COLORS.ink });
  }
  context.page.drawText(label, { x: x + 14, y: y - 5, font: context.regular, size: 7.2, color: COLORS.ink });
}

function drawSignatures(context) {
  ensureSpace(context, 94);
  const y = context.y - 30;
  context.page.drawLine({ start: { x: 42, y }, end: { x: 282, y }, thickness: 0.8, color: COLORS.ink });
  context.page.drawLine({ start: { x: 330, y }, end: { x: 570, y }, thickness: 0.8, color: COLORS.ink });
  context.page.drawText("BUYER SIGNATURE", { x: 42, y: y - 13, font: context.bold, size: 7.2, color: COLORS.navy });
  context.page.drawText("AUTHORIZED DEALER SIGNATURE", { x: 330, y: y - 13, font: context.bold, size: 7.2, color: COLORS.navy });
  context.page.drawText(`Printed name: ${safeText(context.deal.customer?.fullName)}`, {
    x: 42,
    y: y - 31,
    font: context.regular,
    size: 7.2,
    color: COLORS.ink,
  });
  context.page.drawText(
    `Printed name/title: ${DEALER_DOCUMENT_INFORMATION.representative} / ${DEALER_DOCUMENT_INFORMATION.representativeTitle}`,
    { x: 330, y: y - 31, font: context.regular, size: 6.6, color: COLORS.ink }
  );
  context.page.drawText(`Date/time: ${formatUsDate(context.deal.saleDate)} __________________`, {
    x: 42,
    y: y - 49,
    font: context.regular,
    size: 7.2,
    color: COLORS.ink,
  });
  context.page.drawText(`Date/time: ${formatUsDate(context.deal.saleDate)} __________________`, {
    x: 330,
    y: y - 49,
    font: context.regular,
    size: 7.2,
    color: COLORS.ink,
  });
  context.y = y - 58;
}

function drawAgreementFooters(context) {
  const pageCount = context.pages.length;
  context.pages.forEach((page, index) => {
    page.drawLine({ start: { x: 42, y: 33 }, end: { x: 570, y: 33 }, thickness: 0.5, color: COLORS.line });
    page.drawText("ALEJO MOTORS | Cash Vehicle Purchase Agreement / Buyer's Order | Buyer receives a completed copy", {
      x: 42,
      y: 20,
      font: context.regular,
      size: 6.5,
      color: COLORS.muted,
    });
    drawRightText(page, `Page ${index + 1} of ${pageCount}`, 570, 20, context.regular, 6.5, COLORS.muted);
  });
}

function ensureSpace(context, needed) {
  if (context.y - needed < 48) addAgreementPage(context);
}

function setFormText(form, name, value, fontSize) {
  const field = form.getTextField(name);
  const text = safeText(value).toLocaleUpperCase("en-US");
  field.setText(text);
  field.setFontSize(fontSize);
}

function wrapText(font, text, size, maxWidth) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = words.shift();
  words.forEach((word) => {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });
  lines.push(line);
  return lines;
}

function drawFittedText(page, text, options) {
  let size = options.preferredSize;
  while (size > options.minimumSize && options.font.widthOfTextAtSize(text, size) > options.maxWidth) {
    size -= 0.2;
  }
  page.drawText(text, { x: options.x, y: options.y, font: options.font, size, color: options.color });
}

function drawRightText(page, text, right, y, font, size, color) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: right - width, y, font, size, color });
}

function formatCustomerAddress(customer = {}) {
  const stateAndZip = [customer.state, customer.zip].filter(Boolean).join(" ");
  return [customer.streetAddress, customer.city, stateAndZip].filter(Boolean).join(", ");
}

function formatIdentification(customer = {}) {
  return [customer.identificationType, customer.identificationNumber, customer.identificationState]
    .filter(Boolean)
    .join(" | ");
}

function formatOdometer(value) {
  const mileage = safeText(value);
  if (!mileage) return "N/A";
  return /\bmiles?\b/i.test(mileage) ? mileage : `${mileage} miles`;
}

function vehicleTitle(deal = {}) {
  return [deal.vehicle?.year, deal.vehicle?.make, deal.vehicle?.model].filter(Boolean).join(" ");
}

function createInvoiceNumber(deal = {}) {
  const compact = safeText(deal.dealNumber || deal.id || "INVOICE")
    .replace(/^AM-/i, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return `INV-${compact}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsDate(value) {
  const match = safeText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : safeText(value);
}

function safeText(value) {
  return String(value || "").trim();
}
