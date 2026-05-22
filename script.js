const phoneNumber = "+16789271739";
const apiBaseUrl = window.ALEJO_API_BASE_URL || "";
const photoLimit = 20;

const vehicleGrid = document.querySelector("#vehicleGrid");
const vehicleTemplate = document.querySelector("#vehicleTemplate");
const emptyState = document.querySelector("#emptyState");
const resultCount = document.querySelector("#resultCount");
const soldGrid = document.querySelector("#soldGrid");
const recentlySoldSection = document.querySelector("#recentlySoldSection");
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
const heroSection = document.querySelector(".dealer-hero");

let vehicles = [];
let activeFilter = "all";
let activeSort = "year-new";
let activeQuickFilter = "all";
let searchTerm = "";
let selectedPhotos = [];
let isAdmin = false;
let apiAvailable = true;
const maxRecentlySold = 2;

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
    adminMessage.textContent = "Dealer login is temporarily unavailable. Please try again in a moment.";
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

if (resetInventory) {
  resetInventory.addEventListener("click", async () => {
    if (!isAdmin) return;
    if (!apiAvailable) return;

    vehicles = await apiRequest("/api/reset", { method: "POST" });
    activeFilter = "all";
    setActiveFilter("all");
    renderVehicles();
  });
}

vehicleGrid.addEventListener("click", async (event) => {
  const soldButton = event.target.closest(".sold-button");
  const deleteButton = event.target.closest(".delete-button");

  if ((!soldButton && !deleteButton) || !isAdmin) return;
  if (!apiAvailable) return;

  if (soldButton) {
    const title = soldButton.dataset.title || "this vehicle";
    const confirmSold = window.confirm(`Mark ${title} as sold? It will move to Recently Sold.`);

    if (!confirmSold) {
      return;
    }

    setVehicleFormMessage(`Marking ${title} as sold...`);

    try {
      await apiRequest(`/api/vehicles/${encodeURIComponent(soldButton.dataset.id)}/sold`, { method: "POST" });
      await loadVehicles();
      renderVehicles();
      setVehicleFormMessage(`${title} is now in Recently Sold.`, "success");
    } catch (error) {
      setVehicleFormMessage(error.message || "The vehicle could not be marked as sold.", "error");
    }

    return;
  }

  const title = deleteButton.dataset.title || "this vehicle";
  const confirmDelete = window.confirm(`Remove ${title} from the system?`);

  if (!confirmDelete) {
    return;
  }

  await apiRequest(`/api/vehicles/${encodeURIComponent(deleteButton.dataset.id)}`, { method: "DELETE" });
  await loadVehicles();
  renderVehicles();
  setVehicleFormMessage(`${title} was removed.`, "success");
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
    if (shouldUseStaticFallback()) {
      try {
        const response = await fetch("data/inventory.json", { cache: "no-store" });
        vehicles = await response.json();
        return;
      } catch {
        vehicles = [];
        resultCount.textContent = "Inventory could not load. Please refresh the page.";
        return;
      }
    }

    vehicles = [];
    resultCount.textContent = "Live inventory is temporarily unavailable. Please refresh the page.";
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

function shouldUseStaticFallback() {
  return window.location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
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
  const availableVehicles = vehicles.filter((vehicle) => !isSoldVehicle(vehicle));
  const soldVehicles = getRecentlySoldVehicles();
  const filteredVehicles = availableVehicles.filter((vehicle) => {
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

  vehicleGrid.innerHTML = "";
  resultCount.textContent = `Showing ${visibleVehicles.length} of ${availableVehicles.length} vehicles`;
  emptyState.hidden = visibleVehicles.length > 0;
  renderRecentlySold(soldVehicles);
  renderLotGallery(availableVehicles);
  updateHeroBackground(visibleVehicles[0] || availableVehicles[0] || vehicles[0]);

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

function updateHeroBackground(vehicle) {
  if (!heroSection || !vehicle) return;

  const image = getVehicleImages(vehicle)[0];

  if (image) {
    heroSection.style.setProperty("--hero-image", `url("${image}")`);
  }
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
  const soldButton = card.querySelector(".sold-button");

  soldButton.dataset.id = vehicle.id;
  soldButton.dataset.title = title || "this vehicle";
  soldButton.hidden = !isAdmin;
  deleteButton.dataset.id = vehicle.id;
  deleteButton.dataset.title = title || "this vehicle";
  deleteButton.hidden = !isAdmin;

  return card;
}

function buildSoldCard(vehicle) {
  const card = document.createElement("article");
  const imageWrap = document.createElement("div");
  const image = document.createElement("img");
  const watermark = document.createElement("span");
  const title = document.createElement("h3");
  const vehicleTitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Sold Vehicle";

  card.className = "sold-card";
  imageWrap.className = "sold-card-photo";
  image.src = getVehicleImages(vehicle)[0];
  image.alt = `${vehicleTitle} sold by Alejo Motors`;
  watermark.className = "sold-watermark";
  watermark.textContent = "SOLD";
  title.className = "sold-card-title";
  title.textContent = vehicleTitle;

  imageWrap.append(image, watermark);
  card.append(imageWrap, title);

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

function renderLotGallery(availableVehicles = vehicles.filter((vehicle) => !isSoldVehicle(vehicle))) {
  if (!lotGallery) return;

  const photos = availableVehicles
    .filter((vehicle) => !/mercedes/i.test(`${vehicle.make || ""} ${vehicle.model || ""}`))
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
    const card = document.createElement("a");
    const image = document.createElement("img");
    const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    const label = document.createElement("span");

    card.className = "lot-gallery-card";
    card.href = `detail.html?id=${encodeURIComponent(vehicle.id)}`;
    image.src = src;
    image.alt = title ? `${title} at Alejo Motors` : "Vehicle at Alejo Motors";
    label.className = "lot-gallery-label";
    label.textContent = title || "Available now";

    card.append(image, label);
    lotGallery.append(card);
  });
}

function renderRecentlySold(soldVehicles) {
  if (!recentlySoldSection || !soldGrid) return;

  soldGrid.innerHTML = "";
  recentlySoldSection.hidden = soldVehicles.length === 0;

  soldVehicles.forEach((vehicle) => {
    soldGrid.append(buildSoldCard(vehicle));
  });
}

function getRecentlySoldVehicles() {
  return vehicles
    .filter(isSoldVehicle)
    .sort((first, second) => {
      const firstTime = parseSoldTimestamp(first.soldAt);
      const secondTime = parseSoldTimestamp(second.soldAt);
      return secondTime - firstTime;
    })
    .slice(0, maxRecentlySold);
}

function isSoldVehicle(vehicle) {
  return String(vehicle.status || "").toLowerCase() === "sold";
}

function parseSoldTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
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
