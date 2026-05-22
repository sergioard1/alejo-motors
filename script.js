const phoneNumber = "+16789271739";
const apiBaseUrl = window.ALEJO_API_BASE_URL || "";
const photoLimit = 20;

const vehicleGrid = document.querySelector("#vehicleGrid");
const featuredGrid = document.querySelector("#featuredGrid");
const vehicleTemplate = document.querySelector("#vehicleTemplate");
const emptyState = document.querySelector("#emptyState");
const resultCount = document.querySelector("#resultCount");
const inventorySummary = document.querySelector("#inventorySummary");
const inventorySearch = document.querySelector("#inventorySearch");
const bodyStyleSelect = document.querySelector("#bodyStyleSelect");
const sortSelect = document.querySelector("#sortSelect");
const quickFilterButtons = document.querySelectorAll(".quick-filter");
const vehicleForm = document.querySelector("#vehicleForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const lotGallery = document.querySelector("#lotGallery");
const resetInventory = document.querySelector("#resetInventory");
const filterButtons = document.querySelectorAll(".filter");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminMessage = document.querySelector("#adminMessage");
const adminPanel = document.querySelector("#adminPanel");
const logoutAdmin = document.querySelector("#logoutAdmin");
const loginModal = document.querySelector("#loginModal");
const ownerLoginTriggers = document.querySelectorAll(".owner-login-trigger");
const closeOwnerLogin = document.querySelector("#closeOwnerLogin");
const vehicleFormMessage = document.querySelector("#vehicleFormMessage");
const saveVehicleButton = vehicleForm.querySelector('button[type="submit"]');
const heroInventoryBadge = document.querySelector("#heroInventoryBadge");
const heroPriceBadge = document.querySelector("#heroPriceBadge");
const heroSection = document.querySelector(".dealer-hero");
const statAvailable = document.querySelector("#statAvailable");
const statAffordable = document.querySelector("#statAffordable");
const statUtility = document.querySelector("#statUtility");

let vehicles = [];
let activeFilter = "all";
let activeSort = "featured";
let activeQuickFilter = "all";
let searchTerm = "";
let selectedPhotos = [];
let isAdmin = false;
let apiAvailable = true;
let statsAnimated = false;

init();

if (window.location.hash === "#owner-login") {
  openLoginModal();
}

async function init() {
  applyUrlCategory();
  await loadSession();
  await loadVehicles();
  updateAdminUI();
  renderVehicles();
  requestAnimationFrame(scrollToCurrentHash);
}

function applyUrlCategory() {
  const category = new URLSearchParams(window.location.search).get("category");

  if (!["all", "car", "suv", "pickup"].includes(category)) {
    return;
  }

  activeFilter = category;
  bodyStyleSelect.value = category;
  setActiveFilter(category);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    setActiveFilter(activeFilter);
    renderVehicles();
  });
});

inventorySearch.addEventListener("input", () => {
  searchTerm = inventorySearch.value.trim().toLowerCase();
  renderVehicles();
});

bodyStyleSelect.addEventListener("change", () => {
  activeFilter = bodyStyleSelect.value;
  setActiveFilter(activeFilter);
  renderVehicles();
});

sortSelect.addEventListener("change", () => {
  activeSort = sortSelect.value;
  renderVehicles();
});

quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeQuickFilter = button.dataset.quickFilter;
    setActiveQuickFilter(activeQuickFilter);
    renderVehicles();
  });
});

ownerLoginTriggers.forEach((button) => {
  button.addEventListener("click", openLoginModal);
});

closeOwnerLogin.addEventListener("click", closeLoginModal);

loginModal.addEventListener("click", (event) => {
  if (event.target === loginModal) {
    closeLoginModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loginModal.hidden) {
    closeLoginModal();
  }
});

photoInput.addEventListener("change", async () => {
  const files = [...photoInput.files];

  if (!files.length) {
    selectedPhotos = [];
    renderPhotoPreview([]);
    setVehicleFormMessage("");
    return;
  }

  setVehicleFormMessage("Preparing photos...");

  try {
    const photos = files.slice(0, photoLimit);
    selectedPhotos = await Promise.all(photos.map(resizeImage));
    renderPhotoPreview(selectedPhotos);
    setVehicleFormMessage(
      files.length > photoLimit
        ? `${photoLimit} photos ready. Extra photos were skipped so the vehicle saves faster.`
        : `${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"} ready.`,
      "success"
    );
  } catch {
    selectedPhotos = [];
    photoInput.value = "";
    renderPhotoPreview([]);
    setVehicleFormMessage("Those photos could not be prepared. Try different photos.", "error");
  }
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  adminMessage.textContent = "";

  if (!apiAvailable) {
    adminMessage.textContent = "Owner editing is available from the private local version.";
    return;
  }

  try {
    const session = await apiRequest("/api/login", {
      method: "POST",
      body: {
        email: adminEmailInput.value,
        password: adminPasswordInput.value,
      },
    });

    isAdmin = Boolean(session.authenticated);
    adminPasswordInput.value = "";
    closeLoginModal();
    openOwnerArea();
    updateAdminUI();
    renderVehicles();
  } catch {
    adminMessage.textContent = "Invalid email or password.";
  }
});

logoutAdmin.addEventListener("click", async () => {
  await apiRequest("/api/logout", { method: "POST" });
  isAdmin = false;
  if (window.location.hash === "#manager") {
    window.location.hash = "inventory";
  }
  updateAdminUI();
  renderVehicles();
});

window.addEventListener("hashchange", () => {
  if (window.location.hash === "#owner-login") {
    openLoginModal();
    return;
  }

  updateAdminUI();
  renderVehicles();
});

vehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin) {
    setVehicleFormMessage("Please unlock owner mode first.", "error");
    return;
  }

  if (!apiAvailable) {
    setVehicleFormMessage("Owner editing is not connected. Refresh and try again.", "error");
    return;
  }

  if (!vehicleForm.reportValidity()) {
    return;
  }

  const vehicle = {
    year: document.querySelector("#yearInput").value.trim(),
    make: document.querySelector("#makeInput").value.trim(),
    model: document.querySelector("#modelInput").value.trim(),
    category: document.querySelector("#categoryInput").value,
    miles: document.querySelector("#milesInput").value.trim(),
    price: document.querySelector("#priceInput").value.trim() || "Call for price",
    stockNumber: document.querySelector("#stockNumberInput").value.trim(),
    vin: document.querySelector("#vinInput").value.trim(),
    engine: document.querySelector("#engineInput").value.trim(),
    transmission: document.querySelector("#transmissionInput").value.trim(),
    exteriorColor: document.querySelector("#exteriorColorInput").value.trim(),
    interiorColor: document.querySelector("#interiorColorInput").value.trim(),
    drivetrain: document.querySelector("#drivetrainInput").value.trim(),
    fuelEconomy: document.querySelector("#fuelEconomyInput").value.trim(),
    condition: document.querySelector("#conditionInput").value.trim(),
    damage: document.querySelector("#damageInput").value.trim(),
    notes: document.querySelector("#notesInput").value.trim(),
    images: selectedPhotos.length ? selectedPhotos : ["assets/alejo-motors-logo.svg"],
  };

  saveVehicleButton.disabled = true;
  saveVehicleButton.textContent = "Saving...";
  setVehicleFormMessage("Saving vehicle...");

  try {
    await apiRequest("/api/vehicles", {
      method: "POST",
      body: vehicle,
    });

    await loadVehicles();
    vehicleForm.reset();
    selectedPhotos = [];
    renderPhotoPreview([]);
    activeFilter = "all";
    setActiveFilter("all");
    renderVehicles();
    setVehicleFormMessage("Vehicle saved. It is now live in inventory.", "success");
    document.querySelector("#inventory").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setVehicleFormMessage(error.message || "The vehicle could not be saved. Try again.", "error");
  } finally {
    saveVehicleButton.disabled = false;
    saveVehicleButton.textContent = "Save Vehicle";
  }
});

resetInventory.addEventListener("click", async () => {
  if (!isAdmin) return;
  if (!apiAvailable) return;

  vehicles = await apiRequest("/api/reset", { method: "POST" });
  activeFilter = "all";
  setActiveFilter("all");
  renderVehicles();
});

vehicleGrid.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-button");

  if (!button || !isAdmin) return;
  if (!apiAvailable) return;

  await apiRequest(`/api/vehicles/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
  await loadVehicles();
  renderVehicles();
});

async function loadSession() {
  try {
    const session = await apiRequest("/api/session");
    isAdmin = Boolean(session.authenticated);
  } catch {
    apiAvailable = false;
    isAdmin = false;
  }
}

async function loadVehicles() {
  resultCount.textContent = "Loading inventory...";

  try {
    vehicles = await apiRequest("/api/vehicles");
    apiAvailable = true;
  } catch {
    apiAvailable = false;
    try {
      const response = await fetch("data/inventory.json", { cache: "no-store" });
      vehicles = await response.json();
    } catch {
      vehicles = [];
      resultCount.textContent = "Inventory could not load. Please refresh the page.";
    }
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(buildApiUrl(url), {
    method: options.method || "GET",
    credentials: apiBaseUrl ? "include" : "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Request failed" };
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function buildApiUrl(url) {
  return `${apiBaseUrl}${url}`;
}

function scrollToCurrentHash() {
  if (!window.location.hash || window.location.hash === "#owner-login") {
    return;
  }

  const target = document.querySelector(window.location.hash);

  if (target) {
    target.scrollIntoView({ block: "start" });
  }
}

function renderVehicles() {
  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchesCategory = activeFilter === "all" || vehicle.category === activeFilter;
    const matchesQuickFilter = matchesVehicleQuickFilter(vehicle);
    const searchable = [
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.miles,
      vehicle.price,
      vehicle.stockNumber,
      vehicle.vin,
      vehicle.condition,
      vehicle.engine,
      vehicle.exteriorColor,
      vehicle.interiorColor,
      vehicle.drivetrain,
      vehicle.notes,
    ].join(" ").toLowerCase();

    return matchesCategory && matchesQuickFilter && (!searchTerm || searchable.includes(searchTerm));
  });
  const visibleVehicles = sortVehicles(filteredVehicles);
  const featuredVehicles = getFeaturedVehicles();

  vehicleGrid.innerHTML = "";
  resultCount.textContent = `Showing ${visibleVehicles.length} of ${vehicles.length} vehicles`;
  emptyState.hidden = visibleVehicles.length > 0;
  renderInventorySummary();
  renderFeaturedVehicles(featuredVehicles);
  renderLotGallery();
  updateHeroHighlights();
  updateHeroBackground(featuredVehicles[0] || visibleVehicles[0] || vehicles[0]);
  updateDealerStats();

  visibleVehicles.forEach((vehicle) => {
    vehicleGrid.append(buildVehicleCard(vehicle));
  });
}

function sortVehicles(items) {
  const sortable = [...items];

  if (activeSort === "price-low") {
    return sortable.sort((first, second) => compareKnownNumbers(parsePrice(first.price), parsePrice(second.price)));
  }

  if (activeSort === "price-high") {
    return sortable.sort((first, second) => compareKnownNumbersDesc(parsePrice(first.price), parsePrice(second.price)));
  }

  if (activeSort === "mileage-low") {
    return sortable.sort((first, second) => compareKnownNumbers(parseMileage(first.miles), parseMileage(second.miles)));
  }

  if (activeSort === "year-new") {
    return sortable.sort((first, second) => compareKnownNumbersDesc(parseYear(first.year), parseYear(second.year)));
  }

  return sortable;
}

function compareKnownNumbers(first, second) {
  const firstKnown = Number.isFinite(first);
  const secondKnown = Number.isFinite(second);

  if (firstKnown && secondKnown) return first - second;
  if (firstKnown) return -1;
  if (secondKnown) return 1;
  return 0;
}

function compareKnownNumbersDesc(first, second) {
  const firstKnown = Number.isFinite(first);
  const secondKnown = Number.isFinite(second);

  if (firstKnown && secondKnown) return second - first;
  if (firstKnown) return -1;
  if (secondKnown) return 1;
  return 0;
}

function renderInventorySummary() {
  const counts = vehicles.reduce(
    (total, vehicle) => {
      total[vehicle.category] = (total[vehicle.category] || 0) + 1;
      return total;
    },
    { car: 0, suv: 0, pickup: 0 }
  );
  const prices = vehicles.map((vehicle) => parsePrice(vehicle.price)).filter(Number.isFinite);
  const startingPrice = prices.length ? Math.min(...prices) : null;
  const summaryItems = [
    ["Available", String(vehicles.length)],
    ["Cars", String(counts.car || 0)],
    ["SUVs", String(counts.suv || 0)],
    ["Trucks", String(counts.pickup || 0)],
    ["Starting At", startingPrice ? formatPrice(startingPrice) : "Call"],
  ];

  inventorySummary.innerHTML = summaryItems
    .map(
      ([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");
}

function updateHeroHighlights() {
  const prices = vehicles.map((vehicle) => parsePrice(vehicle.price)).filter(Number.isFinite);
  const startingPrice = prices.length ? Math.min(...prices) : null;
  const label = vehicles.length === 1 ? "Vehicle" : "Vehicles";

  heroInventoryBadge.textContent = vehicles.length ? `${vehicles.length} ${label} Available` : "Inventory Available";
  heroPriceBadge.textContent = startingPrice ? `From ${formatPrice(startingPrice)}` : "Promotions Available";
}

function updateHeroBackground(vehicle) {
  if (!heroSection || !vehicle) return;

  const image = getVehicleImages(vehicle)[0];

  if (image) {
    heroSection.style.setProperty("--hero-image", `url("${image}")`);
  }
}

function renderFeaturedVehicles(items) {
  if (!featuredGrid) return;

  featuredGrid.innerHTML = "";

  items.forEach((vehicle) => {
    const card = buildVehicleCard(vehicle);
    card.classList.add("featured-card");
    featuredGrid.append(card);
  });
}

function buildVehicleCard(vehicle) {
  const card = vehicleTemplate.content.firstElementChild.cloneNode(true);
  const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const subtitle = [buildFamilyPitch(vehicle), formatCategory(vehicle.category)].filter(Boolean).join(" - ");
  const image = card.querySelector("img");
  const detailUrl = `detail.html?id=${encodeURIComponent(vehicle.id)}`;

  card.dataset.category = vehicle.category;
  const photoLink = card.querySelector(".vehicle-photo-link");
  photoLink.href = detailUrl;
  image.src = getVehicleImages(vehicle)[0];
  image.alt = title || "Vehicle for sale";
  card.querySelector(".vehicle-title").href = detailUrl;
  card.querySelector("h3").textContent = title || "Vehicle for Sale";
  card.querySelector(".vehicle-subtitle").textContent = subtitle || "Available now";
  card.querySelector(".vehicle-price").textContent = formatPrice(vehicle.price);
  card.querySelector(".vehicle-specs").innerHTML = renderSpecs([
    ["Mileage", formatMileage(vehicle.miles, true)],
    ["Engine", vehicle.engine],
    ["Exterior Color", vehicle.exteriorColor],
    ["Transmission", vehicle.transmission],
    ["Interior Color", vehicle.interiorColor],
    ["Drivetrain", vehicle.drivetrain],
  ]);
  card.querySelector(".details-link").href = detailUrl;
  card.querySelector(".card-link").href = `tel:${phoneNumber}`;
  card.querySelector(".message-link").href = buildSmsHref(title);

  const deleteButton = card.querySelector(".delete-button");
  deleteButton.dataset.id = vehicle.id;
  deleteButton.hidden = !isAdmin;

  return card;
}

function buildFamilyPitch(vehicle) {
  const notes = String(vehicle.notes || "").toLowerCase();

  if (notes.includes("3rd row")) return "Family size";
  if (notes.includes("good on gas")) return "Gas saver";
  if (notes.includes("clean title")) return "Clean title";
  if (notes.includes("daily driver")) return "Daily driver";
  if (notes.includes("cash deal")) return "Cash deal";
  return vehicle.condition || "Ready to drive";
}

function getFeaturedVehicles() {
  return [...vehicles]
    .sort((first, second) => scoreFeaturedVehicle(second) - scoreFeaturedVehicle(first))
    .slice(0, 3);
}

function scoreFeaturedVehicle(vehicle) {
  let score = 0;
  const notes = String(vehicle.notes || "").toLowerCase();
  const year = parseYear(vehicle.year);
  const price = parsePrice(vehicle.price);
  const drivetrain = String(vehicle.drivetrain || "").toLowerCase();

  if (vehicle.category === "car") score += 4;
  if (vehicle.category === "suv") score += 3;
  if (year >= 2005) score += 3;
  if (Number.isFinite(price) && price <= 6500) score += 3;
  if (notes.includes("clean title")) score += 3;
  if (notes.includes("daily driver")) score += 2;
  if (notes.includes("good on gas")) score += 2;
  if (notes.includes("family")) score += 2;
  if (drivetrain.includes("awd")) score += 1;
  if (notes.includes("classic") || notes.includes("vintage")) score -= 6;
  if (year > 0 && year < 1998) score -= 5;

  return score;
}

function matchesVehicleQuickFilter(vehicle) {
  if (activeQuickFilter === "all") {
    return true;
  }

  if (activeQuickFilter === "under-5000") {
    return parsePrice(vehicle.price) <= 5000;
  }

  if (activeQuickFilter === "suv") {
    return vehicle.category === "suv";
  }

  if (activeQuickFilter === "truck") {
    return vehicle.category === "pickup";
  }

  if (activeQuickFilter === "awd") {
    return /\b(awd|4wd)\b/i.test(String(vehicle.drivetrain || ""));
  }

  if (activeQuickFilter === "gas-saver") {
    const notes = String(vehicle.notes || "");
    const economyText = String(vehicle.fuelEconomy || "");
    const mpgNumbers = `${economyText} ${notes}`.match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
    const topMpg = mpgNumbers.length ? Math.max(...mpgNumbers) : NaN;

    return /good on gas|gas saver/i.test(`${economyText} ${notes}`) || topMpg >= 26;
  }

  return true;
}

function updateDealerStats() {
  const affordableCount = vehicles.filter((vehicle) => parsePrice(vehicle.price) <= 5000).length;
  const utilityCount = vehicles.filter(
    (vehicle) => vehicle.category === "suv" || /\b(awd|4wd)\b/i.test(String(vehicle.drivetrain || ""))
  ).length;

  updateStatElement(statAvailable, vehicles.length);
  updateStatElement(statAffordable, affordableCount);
  updateStatElement(statUtility, utilityCount);
}

function updateStatElement(element, value) {
  if (!element) return;

  element.dataset.target = String(value);

  if (statsAnimated) {
    element.textContent = String(value);
  } else {
    animateStatElement(element, value);
  }
}

function animateStatElement(element, target) {
  const duration = 780;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));

    element.textContent = String(value);

    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    element.textContent = String(target);
    statsAnimated = true;
  }

  requestAnimationFrame(tick);
}

function updateAdminUI() {
  const ownerMode = isOwnerMode();

  document.body.classList.toggle("owner-mode", ownerMode);

  if (!ownerMode && window.location.hash === "#manager") {
    history.replaceState(null, "", "#inventory");
  }

  adminPanel.hidden = !ownerMode;

  document.querySelectorAll(".owner-only").forEach((element) => {
    element.hidden = !ownerMode;
    element.setAttribute("aria-hidden", String(!ownerMode));
  });

  ownerLoginTriggers.forEach((button) => {
    button.hidden = ownerMode;
  });
}

function renderLotGallery() {
  if (!lotGallery) return;

  const photos = vehicles
    .map((vehicle) => ({ image: getVehicleImages(vehicle)[0], vehicle }))
    .filter(({ image }) => image && !image.includes("alejo-motors-logo.svg"))
    .slice(0, 3);

  lotGallery.innerHTML = "";

  if (!photos.length) {
    const image = document.createElement("img");
    image.src = "assets/alejo-motors-logo.svg";
    image.alt = "Alejo Motors Autosales";
    lotGallery.append(image);
    return;
  }

  photos.forEach(({ image: src, vehicle }) => {
    const image = document.createElement("img");
    const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

    image.src = src;
    image.alt = title ? `${title} at Alejo Motors` : "Vehicle at Alejo Motors";
    lotGallery.append(image);
  });
}

function isOwnerMode() {
  return isAdmin && window.location.hash === "#manager";
}

function openLoginModal() {
  if (isAdmin) {
    openOwnerArea();
    return;
  }

  loginModal.hidden = false;
  adminEmailInput.focus();
}

function openOwnerArea() {
  window.location.hash = "manager";
  updateAdminUI();

  document.querySelector("#manager").scrollIntoView({ behavior: "smooth" });
}

function closeLoginModal() {
  loginModal.hidden = true;
  adminMessage.textContent = "";
  adminPasswordInput.value = "";
}

function setActiveFilter(filter) {
  bodyStyleSelect.value = filter;

  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });
}

function setActiveQuickFilter(filter) {
  quickFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.quickFilter === filter);
  });
}

function formatCategory(category) {
  if (category === "car") return "Car";
  if (category === "suv") return "SUV";
  if (category === "pickup") return "Pick Up";
  return "Vehicle";
}

function getVehicleImages(vehicle) {
  if (Array.isArray(vehicle.images) && vehicle.images.length) {
    return vehicle.images;
  }

  return [vehicle.image || "assets/alejo-motors-logo.svg"];
}

function buildSmsHref(title = "this vehicle") {
  const message = `Hi Alejo Motors, I would like more information about ${title || "this vehicle"}.`;

  return `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
}

function renderSpecs(specs) {
  return specs
    .filter(([, value]) => value)
    .slice(0, 6)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
}

function parsePrice(value) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue || /call/i.test(cleanValue)) {
    return NaN;
  }

  const number = Number(cleanValue.replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : NaN;
}

function parseMileage(value) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue || /exempt|call/i.test(cleanValue)) {
    return NaN;
  }

  const number = Number(cleanValue.replace(/[^\d]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : NaN;
}

function parseYear(value) {
  const year = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(year) && year > 1900 ? year : NaN;
}

function formatPrice(value) {
  const price = parsePrice(value);

  if (!Number.isFinite(price)) {
    return String(value || "").trim() || "Call for price";
  }

  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMileage(value, includeUnit = false) {
  const mileage = parseMileage(value);

  if (!Number.isFinite(mileage)) {
    return String(value || "").trim();
  }

  return `${mileage.toLocaleString("en-US")}${includeUnit ? " miles" : ""}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPhotoPreview(images) {
  photoPreview.innerHTML = "";

  if (!images.length) {
    const label = document.createElement("span");
    label.textContent = "Photo preview";
    photoPreview.append(label);
    return;
  }

  images.forEach((src) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = "Selected vehicle";
    photoPreview.append(image);
  });
}

function setVehicleFormMessage(message, tone = "") {
  vehicleFormMessage.textContent = message;
  vehicleFormMessage.classList.toggle("success", tone === "success");
  vehicleFormMessage.classList.toggle("error", tone === "error");
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        let maxWidth = 1000;
        let quality = 0.74;
        let result = "";

        for (let attempt = 0; attempt < 5; attempt += 1) {
          const scale = Math.min(1, maxWidth / image.width);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL("image/jpeg", quality);

          if (result.length < 850_000) {
            break;
          }

          maxWidth = Math.round(maxWidth * 0.82);
          quality = Math.max(0.52, quality - 0.08);
        }

        resolve(result);
      };

      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
