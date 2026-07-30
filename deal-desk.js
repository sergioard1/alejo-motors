import {
  DEFAULT_DEAL_SETTINGS,
  calculateDealPricing,
  calculatePayments,
  normalizeDealSettings,
} from "./deal-math.mjs";

const app = document.querySelector("#dealDeskApp");
const state = {
  ready: false,
  loading: false,
  vehicles: [],
  deals: [],
  defaultSettings: { ...DEFAULT_DEAL_SETTINGS },
  activeSettings: { ...DEFAULT_DEAL_SETTINGS },
  currentDeal: null,
  pricingMode: "base",
  pricingAmount: 0,
  includeDealerProcessingFee: true,
  payments: [],
};

if (app) {
  renderShell();
  bindEvents();
  void checkDealerSession();
}

window.addEventListener("alejo:dealer-state", (event) => {
  if (event.detail?.authenticated) {
    void loadDealDesk();
  }
});

async function checkDealerSession() {
  try {
    const session = await dealerApi("/api/session");
    if (session.authenticated) {
      await loadDealDesk();
    }
  } catch {
    setStatus("El Deal Desk estará disponible después de iniciar sesión.", "muted");
  }
}

async function loadDealDesk(force = false) {
  if (state.loading || (state.ready && !force)) return;
  state.loading = true;
  setStatus("Sincronizando inventario y expedientes...", "muted");

  try {
    const [vehicles, deals, settings] = await Promise.all([
      dealerApi("/api/vehicles"),
      dealerApi("/api/deals"),
      dealerApi("/api/deal-settings"),
    ]);
    state.vehicles = Array.isArray(vehicles) ? vehicles : [];
    state.deals = Array.isArray(deals) ? deals : [];
    state.defaultSettings = normalizeDealSettings(settings);
    if (!state.currentDeal) {
      state.activeSettings = { ...state.defaultSettings };
    }
    state.ready = true;
    renderVehicleOptions();
    renderDealList();
    renderSettingsInputs();
    renderPricing();
    setStatus(
      `${state.vehicles.length} vehículos sincronizados desde alejo-motors.onrender.com.`,
      "success"
    );
  } catch (error) {
    setStatus(error.message || "No se pudo cargar el Deal Desk.", "error");
  } finally {
    state.loading = false;
  }
}

function renderShell() {
  app.innerHTML = `
    <div class="deal-desk-heading">
      <div>
        <p class="eyebrow">Private dealer workspace</p>
        <h2>Deal Desk & Out the Door</h2>
        <p>Inventario en vivo, expediente del comprador, pagos y documentos de venta.</p>
      </div>
      <div class="deal-desk-heading-actions">
        <a class="button quiet" href="#manager">Inventory Manager</a>
        <button class="button quiet" id="dealRefresh" type="button">Sync Inventory</button>
        <button class="button primary" id="dealNew" type="button">New Deal</button>
      </div>
    </div>
    <p class="deal-status" id="dealStatus" role="status"></p>

    <div class="deal-desk-layout">
      <aside class="saved-deals-panel">
        <div class="deal-panel-title">
          <div>
            <span class="deal-kicker">Saved calculations</span>
            <h3>Expedientes</h3>
          </div>
          <span class="deal-count" id="dealCount">0</span>
        </div>
        <label class="deal-search">
          Buscar
          <input id="dealSearch" type="search" placeholder="Buyer, vehicle, VIN..." />
        </label>
        <div class="saved-deals-list" id="savedDealsList"></div>
      </aside>

      <div class="deal-workspace">
        <section class="deal-card">
          <div class="deal-card-heading">
            <div>
              <span class="deal-step">1</span>
              <div>
                <h3>Vehicle & Buyer</h3>
                <p>Selecciona una unidad del inventario para autollenar año, marca, modelo y VIN.</p>
              </div>
            </div>
            <span class="live-inventory-badge">Live inventory</span>
          </div>

          <div class="deal-form-grid">
            <label class="deal-field deal-wide">
              Vehicle from inventory
              <select id="dealVehicleSelect">
                <option value="">Select a vehicle...</option>
              </select>
            </label>
            <label class="deal-field">
              Year
              <input id="dealYear" type="text" maxlength="4" inputmode="numeric" />
            </label>
            <label class="deal-field">
              Make
              <input id="dealMake" type="text" />
            </label>
            <label class="deal-field">
              Model
              <input id="dealModel" type="text" />
            </label>
            <label class="deal-field">
              VIN
              <input id="dealVin" type="text" maxlength="17" autocapitalize="characters" spellcheck="false" />
            </label>
            <label class="deal-field">
              Stock #
              <input id="dealStock" type="text" />
            </label>
            <label class="deal-field">
              Mileage
              <input id="dealMiles" type="text" />
            </label>
            <label class="deal-field">
              Exterior color
              <input id="dealColor" type="text" />
            </label>
            <label class="deal-field">
              Body style
              <input id="dealBodyStyle" type="text" />
            </label>
            <label class="deal-field">
              Sale date
              <input id="dealSaleDate" type="date" />
            </label>
            <label class="deal-field">
              Vehicle cost (optional)
              <input id="dealVehicleCost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="For estimated profit" />
            </label>
          </div>

          <div class="deal-divider"></div>

          <div class="deal-form-grid">
            <label class="deal-field deal-wide">
              Buyer full name
              <input id="buyerFullName" type="text" autocomplete="name" />
            </label>
            <label class="deal-field">
              Phone
              <input id="buyerPhone" type="tel" autocomplete="tel" />
            </label>
            <label class="deal-field">
              Email
              <input id="buyerEmail" type="email" autocomplete="email" />
            </label>
            <label class="deal-field">
              Driver license / ID
              <input id="buyerIdentification" type="text" />
            </label>
            <label class="deal-field">
              ID state
              <input id="buyerIdState" type="text" maxlength="2" value="TX" autocapitalize="characters" />
            </label>
            <label class="deal-field deal-wide">
              Street address
              <input id="buyerAddress" type="text" autocomplete="street-address" />
            </label>
            <label class="deal-field">
              City
              <input id="buyerCity" type="text" autocomplete="address-level2" />
            </label>
            <label class="deal-field">
              State
              <input id="buyerState" type="text" maxlength="2" value="TX" autocomplete="address-level1" />
            </label>
            <label class="deal-field">
              ZIP
              <input id="buyerZip" type="text" maxlength="10" autocomplete="postal-code" />
            </label>
            <label class="deal-field">
              County
              <input id="buyerCounty" type="text" placeholder="Tarrant" />
            </label>
          </div>
        </section>

        <section class="deal-card">
          <div class="deal-card-heading">
            <div>
              <span class="deal-step">2</span>
              <div>
                <h3>Out the Door Calculator</h3>
                <p>El impuesto se aplica únicamente al precio base del vehículo.</p>
              </div>
            </div>
            <button class="button quiet" id="toggleDealSettings" type="button">Edit Default Fees</button>
          </div>

          <div class="pricing-mode" role="group" aria-label="Calculation direction">
            <button class="pricing-mode-button active" data-pricing-mode="base" type="button">
              Enter Base Price
              <small>Calculate Out the Door</small>
            </button>
            <button class="pricing-mode-button" data-pricing-mode="otd" type="button">
              Enter Out the Door
              <small>Calculate Base Price</small>
            </button>
          </div>

          <div class="calculator-grid">
            <div class="calculator-input-panel">
              <label class="deal-field calculator-amount">
                <span id="pricingAmountLabel">Vehicle base price</span>
                <span class="money-input">
                  <span>$</span>
                  <input id="pricingAmount" type="number" min="0" step="0.01" inputmode="decimal" value="0.00" />
                </span>
              </label>

              <label class="fee-switch">
                <input id="includeDealerFee" type="checkbox" checked />
                <span class="fee-switch-control" aria-hidden="true"></span>
                <span>
                  <strong>Dealer Processing Fee</strong>
                  <small id="dealerFeeSwitchAmount">$50.00 included</small>
                </span>
              </label>

              <div class="default-fees-editor" id="defaultFeesEditor" hidden>
                <div class="fees-editor-heading">
                  <strong>Default fee settings</strong>
                  <small>Saved for future calculations without editing code.</small>
                </div>
                <div class="fees-editor-grid">
                  <label>Tax %<input id="settingTaxRate" type="number" min="0" step="0.01" /></label>
                  <label>Inspection<input id="settingInspection" type="number" min="0" step="0.01" /></label>
                  <label>Sticker Shipping<input id="settingSticker" type="number" min="0" step="0.01" /></label>
                  <label>Dealer Processing<input id="settingDealer" type="number" min="0" step="0.01" /></label>
                  <label>Title / Registration<input id="settingTitle" type="number" min="0" step="0.01" /></label>
                  <label>Buyer Plate<input id="settingPlate" type="number" min="0" step="0.01" /></label>
                </div>
                <div class="fees-editor-actions">
                  <button class="button primary" id="saveDealSettings" type="button">Save Defaults</button>
                  <button class="button quiet" id="resetDealSettings" type="button">Restore Original Defaults</button>
                </div>
              </div>
            </div>

            <div class="price-breakdown">
              <div class="price-line emphasized"><span>Vehicle base price</span><strong id="summaryBase">$0.00</strong></div>
              <div class="price-line"><span>Texas Sales Tax <span id="summaryTaxRate">6.25%</span></span><strong id="summaryTax">$0.00</strong></div>
              <div class="price-line"><span>State Inspection</span><strong id="summaryInspection">$25.00</strong></div>
              <div class="price-line"><span>Sticker Shipping</span><strong id="summarySticker">$10.00</strong></div>
              <div class="price-line" id="summaryDealerRow"><span>Dealer Processing Fee</span><strong id="summaryDealer">$50.00</strong></div>
              <div class="price-line"><span>Title, Registration & State Fees (TxDMV)</span><strong id="summaryTitle">$120.00</strong></div>
              <div class="price-line"><span>Buyer Plate Fee</span><strong id="summaryPlate">$10.00</strong></div>
              <div class="price-line fees-total"><span>Total charges</span><strong id="summaryFees">$215.00</strong></div>
              <div class="price-line out-the-door"><span>Total Out the Door</span><strong id="summaryOtd">$0.00</strong></div>
            </div>
          </div>
        </section>

        <section class="deal-card">
          <div class="deal-card-heading">
            <div>
              <span class="deal-step">3</span>
              <div>
                <h3>Deposits & Payments</h3>
                <p>Los pagos reducen únicamente el saldo pendiente.</p>
              </div>
            </div>
          </div>
          <div class="payment-entry">
            <label class="deal-field">Type
              <select id="paymentType"><option value="deposit">Deposit</option><option value="payment">Payment received</option></select>
            </label>
            <label class="deal-field">Amount
              <input id="paymentAmount" type="number" min="0.01" step="0.01" inputmode="decimal" />
            </label>
            <label class="deal-field">Date
              <input id="paymentDate" type="date" />
            </label>
            <label class="deal-field payment-note">Note
              <input id="paymentNote" type="text" placeholder="Cash, Zelle, receipt..." />
            </label>
            <button class="button primary" id="addPayment" type="button">Add</button>
          </div>
          <div class="payments-list" id="paymentsList"></div>
          <div class="payment-summary">
            <div><span>Deposits</span><strong id="summaryDeposits">$0.00</strong></div>
            <div><span>Other payments</span><strong id="summaryOtherPayments">$0.00</strong></div>
            <div><span>Total received</span><strong id="summaryReceived">$0.00</strong></div>
            <div class="balance"><span>Balance due</span><strong id="summaryBalance">$0.00</strong></div>
            <div id="profitSummary" hidden><span>Estimated profit</span><strong id="summaryProfit">$0.00</strong></div>
          </div>
        </section>

        <section class="deal-card">
          <div class="deal-card-heading">
            <div>
              <span class="deal-step">4</span>
              <div>
                <h3>Primary Documents</h3>
                <p>Estos son los cuatro documentos principales del expediente.</p>
              </div>
            </div>
          </div>
          <div class="primary-documents">
            <article class="document-card primary-document">
              <span class="document-number">01</span>
              <h4>Vehicle Purchase Agreement</h4>
              <p>English agreement with buyer, vehicle, price and payment details filled in.</p>
              <button class="button quiet document-action" data-document="agreement" type="button">Preview / Print</button>
            </article>
            <article class="document-card primary-document">
              <span class="document-number">02</span>
              <h4>Bill of Sale</h4>
              <p>English bill of sale based on Alejo Motors' current document.</p>
              <button class="button quiet document-action" data-document="bill-of-sale" type="button">Preview / Print</button>
            </article>
            <article class="document-card primary-document">
              <span class="document-number">03</span>
              <h4>Form 130-U</h4>
              <p>Official Texas form with vehicle, buyer, sales price and tax fields completed.</p>
              <button class="button quiet document-action" data-document="form-130-u" type="button">Open Filled PDF</button>
            </article>
            <article class="document-card primary-document">
              <span class="document-number">04</span>
              <h4>Invoice</h4>
              <p>Itemized Out the Door invoice with payments received and balance due.</p>
              <button class="button quiet document-action" data-document="invoice" type="button">Preview / Print</button>
            </article>
          </div>

          <details class="supporting-documents">
            <summary>Supporting documents (English only)</summary>
            <div class="supporting-document-links">
              <a href="assets/dealer-documents/temporary-permits-vtr-66.pdf" target="_blank">Temporary Permits - VTR-66</a>
              <a href="assets/dealer-documents/rebuilt-motor-vehicle-notice.pdf" target="_blank">Rebuilt Motor Vehicle Notice</a>
              <a href="assets/dealer-documents/salvage-motor-vehicle-notice.pdf" target="_blank">Salvage Motor Vehicle Notice</a>
              <a href="assets/dealer-documents/non-operational-bill-of-sale.docx">Non-Operational Bill of Sale</a>
              <a href="assets/dealer-documents/vehicle-sale-receipt.xlsx">Vehicle Sale Receipt</a>
              <a href="assets/dealer-documents/office-notice.docx">Office Notice</a>
            </div>
          </details>
        </section>

        <section class="deal-card deal-final-actions">
          <label class="deal-field deal-notes">
            Internal notes
            <textarea id="dealNotes" rows="3" placeholder="Notes kept with this private deal..."></textarea>
          </label>
          <div class="deal-save-actions">
            <button class="button quiet" id="copyBreakdown" type="button">Copy Breakdown</button>
            <button class="button primary" id="saveDeal" type="button">Save Calculation</button>
          </div>
        </section>
      </div>
    </div>
  `;

  setTodayDefaults();
}

function bindEvents() {
  app.addEventListener("click", async (event) => {
    const modeButton = event.target.closest("[data-pricing-mode]");
    if (modeButton) {
      const current = getPricing();
      state.pricingMode = modeButton.dataset.pricingMode;
      state.pricingAmount =
        state.pricingMode === "base" ? current.basePrice : current.outTheDoor;
      document.querySelector("#pricingAmount").value = state.pricingAmount.toFixed(2);
      renderPricing();
      return;
    }

    const savedDealButton = event.target.closest("[data-deal-id]");
    if (savedDealButton) {
      loadSavedDeal(savedDealButton.dataset.dealId);
      return;
    }

    const removePaymentButton = event.target.closest("[data-remove-payment]");
    if (removePaymentButton) {
      state.payments = state.payments.filter(
        (payment) => payment.id !== removePaymentButton.dataset.removePayment
      );
      renderPricing();
      return;
    }

    const documentButton = event.target.closest("[data-document]");
    if (documentButton) {
      await openDocument(documentButton.dataset.document);
      return;
    }

    try {
      if (event.target.closest("#dealRefresh")) await loadDealDesk(true);
      if (event.target.closest("#dealNew")) startNewDeal();
      if (event.target.closest("#addPayment")) addPayment();
      if (event.target.closest("#saveDeal")) await saveDeal();
      if (event.target.closest("#copyBreakdown")) await copyBreakdown();
      if (event.target.closest("#toggleDealSettings")) {
        const editor = document.querySelector("#defaultFeesEditor");
        editor.hidden = !editor.hidden;
      }
      if (event.target.closest("#saveDealSettings")) await saveDefaultSettings();
      if (event.target.closest("#resetDealSettings")) await resetDefaultSettings();
    } catch (error) {
      setStatus(error.message || "The action could not be completed.", "error");
    }
  });

  app.addEventListener("input", (event) => {
    if (event.target.id === "pricingAmount") {
      state.pricingAmount = Number(event.target.value) || 0;
      renderPricing();
    }
    if (event.target.id === "includeDealerFee") {
      state.includeDealerProcessingFee = event.target.checked;
      renderPricing();
    }
    if (event.target.id === "dealVehicleCost") {
      renderPricing();
    }
    if (event.target.id === "dealSearch") {
      renderDealList(event.target.value);
    }
    if (event.target.id === "dealVin") {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    }
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "dealVehicleSelect") {
      fillVehicle(event.target.value);
    }
  });
}

function renderVehicleOptions() {
  const select = document.querySelector("#dealVehicleSelect");
  const selected = select.value;
  const options = state.vehicles
    .slice()
    .sort((a, b) => {
      const statusDifference = Number(isSold(a)) - Number(isSold(b));
      if (statusDifference) return statusDifference;
      return Number(b.year || 0) - Number(a.year || 0);
    })
    .map((vehicle) => {
      const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
      const suffix = [
        vehicle.stockNumber ? `Stock ${vehicle.stockNumber}` : "",
        isSold(vehicle) ? "SOLD" : "Available",
      ]
        .filter(Boolean)
        .join(" - ");
      return `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(`${title} - ${suffix}`)}</option>`;
    })
    .join("");

  select.innerHTML = `<option value="">Select a vehicle...</option>${options}`;
  select.value = state.vehicles.some((vehicle) => vehicle.id === selected) ? selected : "";
}

function fillVehicle(vehicleId) {
  const vehicle = state.vehicles.find((entry) => entry.id === vehicleId);
  if (!vehicle) return;

  setValue("dealYear", vehicle.year);
  setValue("dealMake", vehicle.make);
  setValue("dealModel", vehicle.model);
  setValue("dealVin", vehicle.vin);
  setValue("dealStock", vehicle.stockNumber);
  setValue("dealMiles", vehicle.miles);
  setValue("dealColor", vehicle.exteriorColor);
  setValue("dealBodyStyle", vehicle.category);

  const inventoryPrice = parseMoney(vehicle.price);
  if (inventoryPrice > 0 && state.pricingAmount === 0) {
    state.pricingMode = "base";
    state.pricingAmount = inventoryPrice;
    setValue("pricingAmount", inventoryPrice.toFixed(2));
    renderPricing();
  }

  setStatus("Vehicle information filled from the live inventory.", "success");
}

function getPricing() {
  return calculateDealPricing({
    mode: state.pricingMode,
    amount: state.pricingAmount,
    includeDealerProcessingFee: state.includeDealerProcessingFee,
    settings: state.activeSettings,
  });
}

function renderPricing() {
  const pricing = getPricing();
  const paymentTotals = calculatePayments(state.payments, pricing.outTheDoor);
  const vehicleCost = parseMoney(getValue("dealVehicleCost"));
  const profit = vehicleCost > 0 ? pricing.basePrice - vehicleCost : null;

  document.querySelectorAll("[data-pricing-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.pricingMode === state.pricingMode);
  });
  setText(
    "pricingAmountLabel",
    state.pricingMode === "base" ? "Vehicle base price" : "Desired Out the Door total"
  );
  setText("summaryBase", formatMoney(pricing.basePrice));
  setText("summaryTaxRate", `${formatNumber(pricing.taxRate)}%`);
  setText("summaryTax", formatMoney(pricing.taxAmount));
  setText("summaryInspection", formatMoney(pricing.stateInspection));
  setText("summarySticker", formatMoney(pricing.stickerShipping));
  setText("summaryDealer", formatMoney(pricing.dealerProcessingFee));
  setText("summaryTitle", formatMoney(pricing.titleRegistrationFees));
  setText("summaryPlate", formatMoney(pricing.buyerPlateFee));
  setText("summaryFees", formatMoney(pricing.totalFees));
  setText("summaryOtd", formatMoney(pricing.outTheDoor));
  document.querySelector("#summaryDealerRow").hidden = !pricing.includeDealerProcessingFee;
  document.querySelector("#includeDealerFee").checked = pricing.includeDealerProcessingFee;
  setText(
    "dealerFeeSwitchAmount",
    pricing.includeDealerProcessingFee
      ? `${formatMoney(state.activeSettings.dealerProcessingFee)} included`
      : "$0.00 - removed from invoice"
  );

  setText("summaryDeposits", formatMoney(paymentTotals.deposits));
  setText("summaryOtherPayments", formatMoney(paymentTotals.otherPayments));
  setText("summaryReceived", formatMoney(paymentTotals.received));
  setText("summaryBalance", formatMoney(paymentTotals.balance));
  document.querySelector("#profitSummary").hidden = profit === null;
  setText("summaryProfit", profit === null ? "$0.00" : formatMoney(profit));
  renderPayments();
}

function renderPayments() {
  const list = document.querySelector("#paymentsList");
  if (!state.payments.length) {
    list.innerHTML = `<p class="empty-payment">No deposits or payments recorded.</p>`;
    return;
  }

  list.innerHTML = state.payments
    .map(
      (payment) => `
        <div class="payment-row">
          <div>
            <strong>${payment.type === "deposit" ? "Deposit" : "Payment received"}</strong>
            <span>${escapeHtml(payment.date || "No date")}${payment.note ? ` - ${escapeHtml(payment.note)}` : ""}</span>
          </div>
          <strong>${formatMoney(payment.amount)}</strong>
          <button type="button" data-remove-payment="${escapeHtml(payment.id)}" aria-label="Remove payment">Remove</button>
        </div>
      `
    )
    .join("");
}

function addPayment() {
  const amount = parseMoney(getValue("paymentAmount"));
  if (amount <= 0) {
    setStatus("Enter a payment amount greater than zero.", "error");
    return;
  }

  state.payments.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    type: getValue("paymentType") === "deposit" ? "deposit" : "payment",
    amount,
    date: getValue("paymentDate"),
    note: getValue("paymentNote"),
  });
  setValue("paymentAmount", "");
  setValue("paymentNote", "");
  renderPricing();
  setStatus("Payment added. Save the calculation to keep it in the deal.", "success");
}

function buildDraft() {
  const pricing = getPricing();
  return {
    ...(state.currentDeal ? { id: state.currentDeal.id, dealNumber: state.currentDeal.dealNumber } : {}),
    vehicleId: getValue("dealVehicleSelect"),
    vehicle: {
      year: getValue("dealYear"),
      make: getValue("dealMake"),
      model: getValue("dealModel"),
      vin: getValue("dealVin"),
      stockNumber: getValue("dealStock"),
      miles: getValue("dealMiles"),
      color: getValue("dealColor"),
      bodyStyle: getValue("dealBodyStyle"),
    },
    customer: {
      fullName: getValue("buyerFullName"),
      phone: getValue("buyerPhone"),
      email: getValue("buyerEmail"),
      identification: getValue("buyerIdentification"),
      idState: getValue("buyerIdState"),
      address: getValue("buyerAddress"),
      city: getValue("buyerCity"),
      state: getValue("buyerState"),
      zip: getValue("buyerZip"),
      county: getValue("buyerCounty"),
    },
    saleDate: getValue("dealSaleDate"),
    settings: state.activeSettings,
    pricing,
    payments: state.payments,
    vehicleCost: parseMoney(getValue("dealVehicleCost")),
    notes: getValue("dealNotes"),
    status: state.currentDeal?.status || "open",
  };
}

async function saveDeal({ quiet = false } = {}) {
  const draft = buildDraft();
  if (!draft.vehicle.year || !draft.vehicle.make || !draft.vehicle.model || !draft.vehicle.vin) {
    throwStatus("Select a vehicle or complete year, make, model and VIN before saving.");
  }

  const isUpdate = Boolean(state.currentDeal?.id);
  const saved = await dealerApi(
    isUpdate ? `/api/deals/${encodeURIComponent(state.currentDeal.id)}` : "/api/deals",
    {
      method: isUpdate ? "PUT" : "POST",
      body: draft,
    }
  );
  state.currentDeal = saved;
  state.payments = saved.payments || [];
  state.activeSettings = normalizeDealSettings(saved.settings);
  const index = state.deals.findIndex((deal) => deal.id === saved.id);
  if (index >= 0) state.deals[index] = saved;
  else state.deals.unshift(saved);
  renderDealList(getValue("dealSearch"));
  renderPricing();
  if (!quiet) setStatus(`Saved ${saved.dealNumber}. You can reopen and edit it later.`, "success");
  return saved;
}

function loadSavedDeal(dealId) {
  const deal = state.deals.find((entry) => entry.id === dealId);
  if (!deal) return;

  state.currentDeal = deal;
  state.activeSettings = normalizeDealSettings(deal.settings);
  state.pricingMode = deal.pricing?.mode === "otd" ? "otd" : "base";
  state.pricingAmount =
    state.pricingMode === "otd" ? deal.pricing.outTheDoor : deal.pricing.basePrice;
  state.includeDealerProcessingFee = deal.pricing?.includeDealerProcessingFee !== false;
  state.payments = Array.isArray(deal.payments) ? [...deal.payments] : [];

  setValue("dealVehicleSelect", deal.vehicleId);
  setValue("dealYear", deal.vehicle.year);
  setValue("dealMake", deal.vehicle.make);
  setValue("dealModel", deal.vehicle.model);
  setValue("dealVin", deal.vehicle.vin);
  setValue("dealStock", deal.vehicle.stockNumber);
  setValue("dealMiles", deal.vehicle.miles);
  setValue("dealColor", deal.vehicle.color);
  setValue("dealBodyStyle", deal.vehicle.bodyStyle);
  setValue("dealSaleDate", deal.saleDate);
  setValue("dealVehicleCost", deal.vehicleCost || "");
  setValue("buyerFullName", deal.customer.fullName);
  setValue("buyerPhone", deal.customer.phone);
  setValue("buyerEmail", deal.customer.email);
  setValue("buyerIdentification", deal.customer.identification);
  setValue("buyerIdState", deal.customer.idState || "TX");
  setValue("buyerAddress", deal.customer.address);
  setValue("buyerCity", deal.customer.city);
  setValue("buyerState", deal.customer.state || "TX");
  setValue("buyerZip", deal.customer.zip);
  setValue("buyerCounty", deal.customer.county);
  setValue("pricingAmount", Number(state.pricingAmount || 0).toFixed(2));
  setValue("dealNotes", deal.notes);
  renderPricing();
  setStatus(`Editing ${deal.dealNumber}.`, "success");
  document.querySelector("#deal-desk").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startNewDeal() {
  state.currentDeal = null;
  state.activeSettings = { ...state.defaultSettings };
  state.pricingMode = "base";
  state.pricingAmount = 0;
  state.includeDealerProcessingFee = true;
  state.payments = [];
  [
    "dealVehicleSelect",
    "dealYear",
    "dealMake",
    "dealModel",
    "dealVin",
    "dealStock",
    "dealMiles",
    "dealColor",
    "dealBodyStyle",
    "dealVehicleCost",
    "buyerFullName",
    "buyerPhone",
    "buyerEmail",
    "buyerIdentification",
    "buyerAddress",
    "buyerCity",
    "buyerZip",
    "buyerCounty",
    "dealNotes",
  ].forEach((id) => setValue(id, ""));
  setValue("buyerIdState", "TX");
  setValue("buyerState", "TX");
  setValue("pricingAmount", "0.00");
  setTodayDefaults();
  renderPricing();
  setStatus("New calculation ready.", "success");
}

function renderDealList(filter = "") {
  const list = document.querySelector("#savedDealsList");
  const query = String(filter || "").trim().toLowerCase();
  const deals = state.deals.filter((deal) => {
    const searchValue = [
      deal.dealNumber,
      deal.customer?.fullName,
      deal.vehicle?.year,
      deal.vehicle?.make,
      deal.vehicle?.model,
      deal.vehicle?.vin,
    ]
      .join(" ")
      .toLowerCase();
    return !query || searchValue.includes(query);
  });
  setText("dealCount", String(state.deals.length));

  if (!deals.length) {
    list.innerHTML = `<p class="empty-deals">${query ? "No matching deals." : "No saved deals yet."}</p>`;
    return;
  }

  list.innerHTML = deals
    .map((deal) => {
      const title = [deal.vehicle?.year, deal.vehicle?.make, deal.vehicle?.model]
        .filter(Boolean)
        .join(" ");
      return `
        <button class="saved-deal ${state.currentDeal?.id === deal.id ? "active" : ""}" type="button" data-deal-id="${escapeHtml(deal.id)}">
          <span>${escapeHtml(deal.dealNumber)}</span>
          <strong>${escapeHtml(deal.customer?.fullName || "Buyer not entered")}</strong>
          <small>${escapeHtml(title || "Vehicle")} · ${formatMoney(deal.pricing?.outTheDoor)}</small>
        </button>
      `;
    })
    .join("");
}

async function saveDefaultSettings() {
  const settings = normalizeDealSettings({
    taxRate: getValue("settingTaxRate"),
    stateInspection: getValue("settingInspection"),
    stickerShipping: getValue("settingSticker"),
    dealerProcessingFee: getValue("settingDealer"),
    titleRegistrationFees: getValue("settingTitle"),
    buyerPlateFee: getValue("settingPlate"),
  });
  const saved = await dealerApi("/api/deal-settings", { method: "PUT", body: settings });
  state.defaultSettings = normalizeDealSettings(saved);
  state.activeSettings = { ...state.defaultSettings };
  renderSettingsInputs();
  renderPricing();
  setStatus("Default charges saved for future calculations.", "success");
}

async function resetDefaultSettings() {
  if (!window.confirm("Restore the original Texas fee defaults?")) return;
  const saved = await dealerApi("/api/deal-settings/reset", { method: "POST" });
  state.defaultSettings = normalizeDealSettings(saved);
  state.activeSettings = { ...state.defaultSettings };
  renderSettingsInputs();
  renderPricing();
  setStatus("Original default charges restored.", "success");
}

function renderSettingsInputs() {
  setValue("settingTaxRate", state.defaultSettings.taxRate);
  setValue("settingInspection", state.defaultSettings.stateInspection);
  setValue("settingSticker", state.defaultSettings.stickerShipping);
  setValue("settingDealer", state.defaultSettings.dealerProcessingFee);
  setValue("settingTitle", state.defaultSettings.titleRegistrationFees);
  setValue("settingPlate", state.defaultSettings.buyerPlateFee);
}

async function openDocument(type) {
  const draft = buildDraft();
  const missing = [];
  if (!draft.customer.fullName) missing.push("buyer name");
  if (!draft.vehicle.vin) missing.push("VIN");
  if (!draft.vehicle.year || !draft.vehicle.make || !draft.vehicle.model) missing.push("vehicle details");
  if (type === "form-130-u" && !draft.customer.address) missing.push("buyer address");

  if (missing.length) {
    setStatus(`Complete ${missing.join(", ")} before generating this document.`, "error");
    return;
  }

  const preview = window.open("", "_blank");
  if (!preview) {
    setStatus("Allow pop-ups for Alejo Motors to open printable documents.", "error");
    return;
  }
  preview.document.write("<p style='font:16px Arial;padding:24px'>Preparing document...</p>");

  try {
    const deal = await saveDeal({ quiet: true });
    if (type === "form-130-u") {
      const pdfUrl = `/api/deals/${encodeURIComponent(deal.id)}/form-130-u.pdf`;
      const token = window.localStorage.getItem("alejo_owner_token") || "";
      const response = await fetch(pdfUrl, {
        credentials: "same-origin",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Form 130-U could not be generated.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      preview.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
      setStatus("Filled Form 130-U opened in a private tab.", "success");
      return;
    }

    preview.document.open();
    preview.document.write(buildPrintableDocument(type, deal));
    preview.document.close();
    setStatus(`${documentLabel(type)} ready to print or save as PDF.`, "success");
  } catch (error) {
    preview.close();
    setStatus(error.message || "The document could not be generated.", "error");
  }
}

function buildPrintableDocument(type, deal) {
  if (type === "agreement") return printLayout("Vehicle Purchase Agreement", agreementBody(deal), deal);
  if (type === "bill-of-sale") return printLayout("Bill of Sale", billOfSaleBody(deal), deal);
  return printLayout("Invoice", invoiceBody(deal), deal);
}

function printLayout(title, body, deal) {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(deal.dealNumber)} - ${escapeHtml(title)}</title>
        <style>
          *{box-sizing:border-box} body{margin:0;background:#ececec;color:#111;font:12px/1.45 Arial,sans-serif}
          .toolbar{position:sticky;top:0;display:flex;justify-content:center;padding:12px;background:#111}
          .toolbar button{border:0;border-radius:6px;background:#d71920;color:#fff;padding:11px 18px;font-weight:800;cursor:pointer}
          .page{width:8.5in;min-height:11in;margin:20px auto;padding:.55in .65in;background:#fff;box-shadow:0 8px 24px #0002}
          header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #d71920;padding-bottom:14px;margin-bottom:20px}
          h1{font-size:23px;line-height:1.1;margin:0;text-transform:uppercase} h2{font-size:13px;margin:18px 0 7px;text-transform:uppercase;border-bottom:1px solid #bbb;padding-bottom:4px}
          h3{margin:0 0 5px}.brand{text-align:right}.brand strong{font-size:17px}.muted{color:#555}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
          .field{border-bottom:1px solid #333;min-height:20px;padding:2px 3px}.field strong{display:inline-block;min-width:82px}
          p{margin:0 0 10px;text-align:justify}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:38px}.signature{border-top:1px solid #111;padding-top:6px}
          table{width:100%;border-collapse:collapse;margin:10px 0 16px}th,td{padding:7px;border-bottom:1px solid #ccc;text-align:left}th:last-child,td:last-child{text-align:right}
          .total td{font-size:15px;font-weight:800;border-top:2px solid #111}.balance td{font-size:17px;color:#b20f17;font-weight:900}
          .note{padding:10px;border:1px solid #aaa;background:#f7f7f7}.invoice-status{font-size:12px;text-transform:uppercase;font-weight:900;color:#b20f17}
          @page{size:letter;margin:.35in}@media print{body{background:#fff}.toolbar{display:none}.page{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}}
        </style>
      </head>
      <body>
        <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
        <main class="page">
          <header>
            <div><h1>${escapeHtml(title)}</h1><div class="muted">Agreement / Invoice No. ${escapeHtml(deal.dealNumber)}</div></div>
            <div class="brand"><strong>ALEJO MOTORS</strong><br />5601 E Lancaster Ave<br />Fort Worth, TX 76112<br />(678) 927-1739</div>
          </header>
          ${body}
        </main>
      </body>
    </html>`;
}

function agreementBody(deal) {
  return `
    <p>In the city of Fort Worth, Texas, on ${escapeHtml(longDate(deal.saleDate))}, this agreement is entered into between:</p>
    <p><strong>Seller:</strong> ALEJO MOTORS, located at 5601 E Lancaster Ave, Fort Worth, TX 76112.</p>
    ${buyerVehicleBlock(deal)}
    <h2>Price and Payment Terms</h2>
    <p>The total purchase price of the vehicle under this agreement is <strong>${formatMoney(deal.pricing.outTheDoor)}</strong>. Payments received total <strong>${formatMoney(deal.paymentTotals.received)}</strong>, leaving a balance of <strong>${formatMoney(deal.paymentTotals.balance)}</strong>. The Buyer acknowledges that no additional agreement changes the obligations stated here.</p>
    <h2>Title Transfer Process</h2>
    <p>For the Buyer's convenience, the Seller commits to handling the title transfer process through the Texas Department of Motor Vehicles. The Buyer understands that processing time may depend on agency appointments, document requirements, and administrative processing, and agrees to provide the information and payments required to complete the transfer.</p>
    <h2>Taxes and Registration</h2>
    <p>The Buyer acknowledges responsibility for the applicable taxes and title, registration, inspection, plate, and processing charges shown in the transaction invoice. Any fines, penalties, or added fees caused by delayed buyer documentation or payment remain the Buyer's responsibility.</p>
    <h2>Vehicle Condition</h2>
    <p>The Buyer has had the opportunity to inspect the vehicle and accepts it "as-is," without an additional warranty from the Seller. A pre-owned vehicle may show wear or imperfections consistent with its age and mileage. Future repairs and maintenance are the Buyer's responsibility.</p>
    <h2>Vehicle Responsibility</h2>
    <p>Upon delivery, the Buyer assumes responsibility for the vehicle's use, maintenance, traffic violations, damages, and other events arising from possession or operation. The Seller is released from liability after delivery except as required by law.</p>
    ${signatureBlock(deal)}
  `;
}

function billOfSaleBody(deal) {
  return `
    <p>This Bill of Sale is executed on ${escapeHtml(longDate(deal.saleDate))} between ALEJO MOTORS, 5601 E Lancaster Ave, Fort Worth, TX 76112, and the Buyer identified below.</p>
    ${buyerVehicleBlock(deal)}
    <h2>Sale Terms</h2>
    <p>The total purchase price is <strong>${formatMoney(deal.pricing.outTheDoor)}</strong>. Amount received: <strong>${formatMoney(deal.paymentTotals.received)}</strong>. Balance due: <strong>${formatMoney(deal.paymentTotals.balance)}</strong>. The sale is final and the vehicle is transferred "as-is," with no warranties expressed or implied.</p>
    <h2>Seller's Disclosure</h2>
    <p>The Seller affirms legal ownership and the right to sell the vehicle and states that, to the best of the Seller's knowledge, it is free of undisclosed liens or legal disputes. The Buyer acknowledges the opportunity to inspect the vehicle and accepts its present condition.</p>
    <h2>Liability Release</h2>
    <p>Upon transfer of possession, the Buyer assumes responsibility for the vehicle. The Seller is released from claims or liabilities arising from the vehicle's use, operation, or maintenance after the transaction, except as required by law.</p>
    ${signatureBlock(deal)}
  `;
}

function invoiceBody(deal) {
  const rows = [
    ["Vehicle base price", deal.pricing.basePrice],
    [`Texas Sales Tax (${formatNumber(deal.pricing.taxRate)}%)`, deal.pricing.taxAmount],
    ["State Inspection", deal.pricing.stateInspection],
    ["Sticker Shipping", deal.pricing.stickerShipping],
    ...(deal.pricing.includeDealerProcessingFee
      ? [["Dealer Processing Fee", deal.pricing.dealerProcessingFee]]
      : []),
    ["Title, Registration & State Fees (TxDMV)", deal.pricing.titleRegistrationFees],
    ["Buyer Plate Fee", deal.pricing.buyerPlateFee],
  ];
  const paymentRows = (deal.payments || [])
    .map(
      (payment) =>
        `<tr><td>${payment.type === "deposit" ? "Deposit" : "Payment received"} - ${escapeHtml(payment.date || "")}${payment.note ? ` (${escapeHtml(payment.note)})` : ""}</td><td>-${formatMoney(payment.amount)}</td></tr>`
    )
    .join("");

  return `
    <div class="meta">
      <div class="field"><strong>Buyer:</strong> ${escapeHtml(deal.customer.fullName)}</div>
      <div class="field"><strong>Date:</strong> ${escapeHtml(formatUsDate(deal.saleDate))}</div>
      <div class="field"><strong>Vehicle:</strong> ${escapeHtml(vehicleTitle(deal))}</div>
      <div class="field"><strong>VIN:</strong> ${escapeHtml(deal.vehicle.vin)}</div>
      <div class="field"><strong>Stock #:</strong> ${escapeHtml(deal.vehicle.stockNumber || "-")}</div>
      <div class="field"><strong>Mileage:</strong> ${escapeHtml(deal.vehicle.miles || "-")}</div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Amount</th></tr></thead>
      <tbody>
        ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${formatMoney(value)}</td></tr>`).join("")}
        <tr><td><strong>Total charges</strong></td><td><strong>${formatMoney(deal.pricing.totalFees)}</strong></td></tr>
        <tr class="total"><td>Total Out the Door</td><td>${formatMoney(deal.pricing.outTheDoor)}</td></tr>
        ${paymentRows}
        <tr><td><strong>Total received</strong></td><td><strong>-${formatMoney(deal.paymentTotals.received)}</strong></td></tr>
        <tr class="balance"><td>Balance due</td><td>${formatMoney(deal.paymentTotals.balance)}</td></tr>
      </tbody>
    </table>
    <p class="note">Deposits and payments reduce only the balance due. They do not change the vehicle base price, sales tax, fees, or total Out the Door price.</p>
    <div class="signatures"><div class="signature">Authorized Alejo Motors representative</div><div class="signature">${escapeHtml(deal.customer.fullName)} - Buyer</div></div>
  `;
}

function buyerVehicleBlock(deal) {
  return `
    <h2>Buyer</h2>
    <div class="meta">
      <div class="field"><strong>Name:</strong> ${escapeHtml(deal.customer.fullName)}</div>
      <div class="field"><strong>Phone:</strong> ${escapeHtml(deal.customer.phone || "-")}</div>
      <div class="field"><strong>Address:</strong> ${escapeHtml(fullAddress(deal.customer) || "-")}</div>
      <div class="field"><strong>ID:</strong> ${escapeHtml(deal.customer.identification || "-")}</div>
    </div>
    <h2>Vehicle Details</h2>
    <div class="meta">
      <div class="field"><strong>Vehicle:</strong> ${escapeHtml(vehicleTitle(deal))}</div>
      <div class="field"><strong>VIN:</strong> ${escapeHtml(deal.vehicle.vin)}</div>
      <div class="field"><strong>Mileage:</strong> ${escapeHtml(deal.vehicle.miles || "-")}</div>
      <div class="field"><strong>Color:</strong> ${escapeHtml(deal.vehicle.color || "-")}</div>
    </div>
  `;
}

function signatureBlock(deal) {
  return `
    <h2>Signatures</h2>
    <div class="signatures">
      <div class="signature">ALEJO MOTORS - Seller / Date</div>
      <div class="signature">${escapeHtml(deal.customer.fullName)} - Buyer / Date</div>
    </div>
  `;
}

async function copyBreakdown() {
  const draft = buildDraft();
  const pricing = draft.pricing;
  const totals = calculatePayments(draft.payments, pricing.outTheDoor);
  const lines = [
    "ALEJO MOTORS - OUT THE DOOR",
    vehicleTitle(draft),
    `VIN: ${draft.vehicle.vin || "-"}`,
    `Vehicle base price: ${formatMoney(pricing.basePrice)}`,
    `Texas Sales Tax (${formatNumber(pricing.taxRate)}%): ${formatMoney(pricing.taxAmount)}`,
    `State Inspection: ${formatMoney(pricing.stateInspection)}`,
    `Sticker Shipping: ${formatMoney(pricing.stickerShipping)}`,
    ...(pricing.includeDealerProcessingFee
      ? [`Dealer Processing Fee: ${formatMoney(pricing.dealerProcessingFee)}`]
      : []),
    `Title, Registration & State Fees: ${formatMoney(pricing.titleRegistrationFees)}`,
    `Buyer Plate Fee: ${formatMoney(pricing.buyerPlateFee)}`,
    `Total charges: ${formatMoney(pricing.totalFees)}`,
    `Total Out the Door: ${formatMoney(pricing.outTheDoor)}`,
    `Payments received: ${formatMoney(totals.received)}`,
    `Balance due: ${formatMoney(totals.balance)}`,
  ];

  await navigator.clipboard.writeText(lines.join("\n"));
  setStatus("Out the Door breakdown copied.", "success");
}

async function dealerApi(path, options = {}) {
  const token = window.localStorage.getItem("alejo_owner_token") || "";
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function throwStatus(message) {
  setStatus(message, "error");
  throw new Error(message);
}

function setStatus(message, type = "") {
  const status = document.querySelector("#dealStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `deal-status ${type}`.trim();
}

function setTodayDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  setValue("dealSaleDate", getValue("dealSaleDate") || today);
  setValue("paymentDate", getValue("paymentDate") || today);
}

function setValue(id, value) {
  const field = document.querySelector(`#${id}`);
  if (field) field.value = value ?? "";
}

function getValue(id) {
  return document.querySelector(`#${id}`)?.value?.trim?.() || "";
}

function setText(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = value;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function parseMoney(value) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function vehicleTitle(deal) {
  return [deal.vehicle?.year, deal.vehicle?.make, deal.vehicle?.model].filter(Boolean).join(" ");
}

function fullAddress(customer) {
  return [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ");
}

function documentLabel(type) {
  if (type === "agreement") return "Vehicle Purchase Agreement";
  if (type === "bill-of-sale") return "Bill of Sale";
  return "Invoice";
}

function formatUsDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

function longDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isSold(vehicle) {
  return String(vehicle?.status || "").toLowerCase() === "sold";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
