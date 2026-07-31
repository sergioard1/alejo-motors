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
let countyLookupTimer = 0;

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
              Identification type
              <select id="buyerIdentificationType">
                <option value="U.S. Driver License/ID Card">U.S. Driver License / ID Card</option>
                <option value="Passport">Passport</option>
                <option value="U.S. Military ID">U.S. Military ID</option>
                <option value="U.S. Department of State ID">U.S. Department of State ID</option>
                <option value="U.S. Department of Homeland Security ID">U.S. Department of Homeland Security ID</option>
                <option value="U.S. Citizenship & Immigration Services/DOJ ID">U.S. Citizenship & Immigration Services / DOJ ID</option>
                <option value="Other government photo ID">Other government photo ID</option>
              </select>
            </label>
            <label class="deal-field">
              Identification number
              <input id="buyerIdentificationNumber" type="text" />
            </label>
            <label class="deal-field">
              Issuing state
              <input id="buyerIdentificationState" type="text" maxlength="2" value="TX" autocapitalize="characters" />
            </label>
            <label class="deal-field deal-wide">
              Street number & name
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
            <div class="deal-field county-field">
              <label for="buyerCounty">County</label>
              <span class="county-input-row">
                <input id="buyerCounty" type="text" placeholder="Filled automatically" />
                <button class="button quiet" id="lookupCounty" type="button">Find</button>
              </span>
              <small id="countyLookupStatus">Completa número y calle, ciudad, estado y ZIP.</small>
            </div>
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
              <div class="price-line"><span>Title, Registration & State Fees</span><strong id="summaryTitle">$120.00</strong></div>
              <div class="price-line"><span>Buyer Plate Fee</span><strong id="summaryPlate">$10.00</strong></div>
              <div class="price-line fees-total"><span>Total charges</span><strong id="summaryFees">$215.00</strong></div>
              <div class="price-line out-the-door"><span>Total Out the Door</span><strong id="summaryOtd">$0.00</strong></div>
            </div>
          </div>
          <div class="calculator-document-actions">
            <div>
              <strong>Printable Negotiation Quote</strong>
              <small>Dealer, customer, vehicle and pricing details in one print-ready PDF.</small>
            </div>
            <button class="button primary document-action" data-document="quote" type="button">Open / Print Quote PDF</button>
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
          </div>
        </section>

        <section class="deal-card">
          <div class="deal-card-heading">
            <div>
              <span class="deal-step">4</span>
              <div>
                <h3>Primary Documents</h3>
                <p>Los cuatro documentos principales del cliente, generados desde cualquier computadora o móvil.</p>
              </div>
            </div>
          </div>
          <div class="primary-documents">
            <article class="document-card primary-document">
              <span class="document-number">01</span>
              <h4>Vehicle Purchase Agreement</h4>
              <p>English agreement with buyer, vehicle, price and payment details filled in.</p>
              <button class="button quiet document-action" data-document="vehicle-purchase-agreement" type="button">Generate Filled Word</button>
            </article>
            <article class="document-card primary-document">
              <span class="document-number">02</span>
              <h4>Bill of Sale</h4>
              <p>English bill of sale based on Alejo Motors' current document.</p>
              <button class="button quiet document-action" data-document="bill-of-sale" type="button">Generate Filled Word</button>
            </article>
            <article class="document-card primary-document">
              <span class="document-number">03</span>
              <h4>Form 130-U</h4>
              <p>Official Texas form with vehicle, buyer, sales price and tax fields completed.</p>
              <button class="button quiet document-action" data-document="form-130-u" type="button">Open Filled PDF</button>
            </article>
            <article class="document-card primary-document">
              <span class="document-number">04</span>
              <h4>Customer Invoice</h4>
              <p>Print-ready invoice with dealer, buyer, vehicle, charges, payments and balance due.</p>
              <button class="button quiet document-action" data-document="invoice" type="button">Open / Print Invoice PDF</button>
            </article>
          </div>
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
      if (event.target.closest("#lookupCounty")) await lookupBuyerCounty();
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
    if (event.target.id === "dealSearch") {
      renderDealList(event.target.value);
    }
    if (event.target.id === "dealVin") {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    }
    if (["buyerState", "buyerIdentificationState"].includes(event.target.id)) {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    }
    if (["buyerAddress", "buyerCity", "buyerState", "buyerZip"].includes(event.target.id)) {
      scheduleCountyLookup();
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

function scheduleCountyLookup() {
  window.clearTimeout(countyLookupTimer);
  setValue("buyerCounty", "");
  const street = getValue("buyerAddress");
  const city = getValue("buyerCity");
  const stateCode = getValue("buyerState").toUpperCase();
  const zip = getValue("buyerZip");

  if (!street || !city || stateCode.length !== 2 || zip.length < 5) {
    setText("countyLookupStatus", "Completa número y calle, ciudad, estado y ZIP.");
    return;
  }

  setText("countyLookupStatus", "Buscando condado...");
  countyLookupTimer = window.setTimeout(() => {
    void lookupBuyerCounty({ quiet: true });
  }, 700);
}

async function lookupBuyerCounty({ quiet = false } = {}) {
  window.clearTimeout(countyLookupTimer);
  const street = getValue("buyerAddress");
  const city = getValue("buyerCity");
  const stateCode = getValue("buyerState").toUpperCase();
  const zip = getValue("buyerZip");
  const requestedAddress = [street, city, stateCode, zip].join("|");

  if (!street || !city || stateCode.length !== 2 || zip.length < 5) {
    setText("countyLookupStatus", "Completa número y calle, ciudad, estado y ZIP.");
    if (!quiet) {
      setStatus("Complete la dirección antes de buscar el condado.", "error");
    }
    return;
  }

  setText("countyLookupStatus", "Buscando condado...");
  try {
    const query = new URLSearchParams({
      street,
      city,
      state: stateCode,
      zip,
    });
    const result = await dealerApi(`/api/county-lookup?${query.toString()}`);
    const currentAddress = [
      getValue("buyerAddress"),
      getValue("buyerCity"),
      getValue("buyerState").toUpperCase(),
      getValue("buyerZip"),
    ].join("|");
    if (currentAddress !== requestedAddress) return;
    setValue("buyerCounty", result.county);
    setText("countyLookupStatus", `${result.county} County · U.S. Census`);
  } catch (error) {
    setText("countyLookupStatus", error.message || "No se encontró el condado.");
    if (!quiet) {
      setStatus(error.message || "No se encontró el condado para esta dirección.", "error");
    }
  }
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
      : "$0.00 - removed from calculation"
  );

  setText("summaryDeposits", formatMoney(paymentTotals.deposits));
  setText("summaryOtherPayments", formatMoney(paymentTotals.otherPayments));
  setText("summaryReceived", formatMoney(paymentTotals.received));
  setText("summaryBalance", formatMoney(paymentTotals.balance));
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
      identificationType: getValue("buyerIdentificationType"),
      identificationNumber: getValue("buyerIdentificationNumber"),
      identificationState: getValue("buyerIdentificationState"),
      streetAddress: getValue("buyerAddress"),
      city: getValue("buyerCity"),
      state: getValue("buyerState"),
      zip: getValue("buyerZip"),
      county: getValue("buyerCounty"),
    },
    saleDate: getValue("dealSaleDate"),
    settings: state.activeSettings,
    pricing,
    payments: state.payments,
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
  setValue("buyerFullName", deal.customer.fullName);
  setValue("buyerPhone", deal.customer.phone);
  setValue("buyerEmail", deal.customer.email);
  setValue(
    "buyerIdentificationType",
    deal.customer.identificationType || "U.S. Driver License/ID Card"
  );
  setValue(
    "buyerIdentificationNumber",
    deal.customer.identificationNumber || deal.customer.identification || ""
  );
  setValue(
    "buyerIdentificationState",
    deal.customer.identificationState || deal.customer.idState || "TX"
  );
  setValue("buyerAddress", deal.customer.streetAddress || deal.customer.address || "");
  setValue("buyerCity", deal.customer.city);
  setValue("buyerState", deal.customer.state || "TX");
  setValue("buyerZip", deal.customer.zip);
  setValue("buyerCounty", deal.customer.county);
  setText(
    "countyLookupStatus",
    deal.customer.county
      ? `${deal.customer.county} County · saved with this deal`
      : "Completa número y calle, ciudad, estado y ZIP."
  );
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
    "buyerFullName",
    "buyerPhone",
    "buyerEmail",
    "buyerIdentificationNumber",
    "buyerAddress",
    "buyerCity",
    "buyerZip",
    "buyerCounty",
    "dealNotes",
  ].forEach((id) => setValue(id, ""));
  setValue("buyerIdentificationType", "U.S. Driver License/ID Card");
  setValue("buyerIdentificationState", "TX");
  setValue("buyerState", "TX");
  setValue("pricingAmount", "0.00");
  setText("countyLookupStatus", "Completa número y calle, ciudad, estado y ZIP.");
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
  const pdfType = ["form-130-u", "quote", "invoice"].includes(type);
  const requiresAddress = type !== "quote";
  const requiresIdentification = [
    "vehicle-purchase-agreement",
    "bill-of-sale",
    "form-130-u",
  ].includes(type);
  if (!draft.customer.fullName) missing.push("buyer name");
  if (!draft.vehicle.vin) missing.push("VIN");
  if (!draft.vehicle.year || !draft.vehicle.make || !draft.vehicle.model) missing.push("vehicle details");
  if (requiresAddress && (
    !draft.customer.streetAddress ||
    !draft.customer.city ||
    !draft.customer.state ||
    !draft.customer.zip
  )) {
    missing.push("complete buyer address");
  }
  if (requiresIdentification && !draft.customer.identificationNumber) {
    missing.push("identification number");
  }
  if (type === "form-130-u" && !draft.customer.county) missing.push("buyer county");

  if (missing.length) {
    setStatus(`Complete ${missing.join(", ")} before generating this document.`, "error");
    return;
  }

  const preview = pdfType ? window.open("", "_blank") : null;
  if (pdfType && !preview) {
    setStatus(`Allow pop-ups for Alejo Motors to open ${documentLabel(type)}.`, "error");
    return;
  }
  if (preview) {
    preview.document.write("<p style='font:16px Arial;padding:24px'>Preparing document...</p>");
  }

  try {
    const deal = await saveDeal({ quiet: true });
    const extension = pdfType ? "pdf" : "docx";
    const endpoint = `/api/deals/${encodeURIComponent(deal.id)}/${type}.${extension}`;
    const response = await fetchPrivateFile(endpoint);
    const objectUrl = URL.createObjectURL(await response.blob());

    if (pdfType && preview) {
      preview.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
      setStatus(`${documentLabel(type)} opened. Use the PDF controls to print, save or share it.`, "success");
      return;
    }

    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = `${deal.dealNumber}-${type}.${extension}`;
    document.body.append(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
    setStatus(`${documentLabel(type)} downloaded with the deal information filled in.`, "success");
  } catch (error) {
    preview?.close();
    setStatus(error.message || "The document could not be generated.", "error");
  }
}

async function fetchPrivateFile(path) {
  const token = window.localStorage.getItem("alejo_owner_token") || "";
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "The document could not be generated.");
  }
  return response;
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

function documentLabel(type) {
  if (type === "vehicle-purchase-agreement") return "Vehicle Purchase Agreement";
  if (type === "bill-of-sale") return "Bill of Sale";
  if (type === "quote") return "Negotiation Quote";
  if (type === "invoice") return "Customer Invoice";
  return "Form 130-U";
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
