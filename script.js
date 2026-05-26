const phoneNumber = "+16789271739";
const apiBaseUrl = window.ALEJO_API_BASE_URL
  || (window.location.hostname === "sergioard1.github.io" ? "https://alejo-motors.onrender.com" : "");
const photoLimit = 20;

const vehicleGrid = document.querySelector("#vehicleGrid");
const vehicleTemplate = document.querySelector("#vehicleTemplate");
const emptyState = document.querySelector("#emptyState");
const resultCount = document.querySelector("#resultCount");
const inventorySearch = document.querySelector("#inventorySearch");
const bodyStyleSelect = document.querySelector("#bodyStyleSelect");
const sortSelect = document.querySelector("#sortSelect");
const quickFilterButtons = document.querySelectorAll(".quick-filter");
const vehicleForm = document.querySelector("#vehicleForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const photoHelpText = document.querySelector("#photoHelpText");
const replacePhotosWrap = document.querySelector("#replacePhotosWrap");
const replacePhotosInput = document.querySelector("#replacePhotosInput");
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
const resetVehicleFormButton = document.querySelector("#resetVehicleForm");
const editModeBanner = document.querySelector("#editModeBanner");
const editVehicleLabel = document.querySelector("#editVehicleLabel");
const cancelEditButton = document.querySelector("#cancelEditButton");
const heroSection = document.querySelector(".dealer-hero");
const heroSoldCount = document.querySelector("#heroSoldCount");
const vehicleFormFields = {
  year: document.querySelector("#yearInput"),
  make: document.querySelector("#makeInput"),
  model: document.querySelector("#modelInput"),
  category: document.querySelector("#categoryInput"),
  miles: document.querySelector("#milesInput"),
  price: document.querySelector("#priceInput"),
  stockNumber: document.querySelector("#stockNumberInput"),
  vin: document.querySelector("#vinInput"),
  engine: document.querySelector("#engineInput"),
  transmission: document.querySelector("#transmissionInput"),
  exteriorColor: document.querySelector("#exteriorColorInput"),
  interiorColor: document.querySelector("#interiorColorInput"),
  drivetrain: document.querySelector("#drivetrainInput"),
  fuelEconomy: document.querySelector("#fuelEconomyInput"),
  condition: document.querySelector("#conditionInput"),
  damage: document.querySelector("#damageInput"),
  notes: document.querySelector("#notesInput"),
};

let vehicles = [];
let activeFilter = "all";
let activeSort = "year-new";
let activeQuickFilter = "all";
let searchTerm = "";
let selectedPhotos = [];
let isAdmin = false;
let apiAvailable = true;
let authToken = window.localStorage.getItem("alejo_owner_token") || "";
let editingVehicleId = "";
let editingVehicleImages = [];
let editingVehicleStatus = "available";
let editingVehicleSoldAt = "";
let siteData = { vehiclesSold: 50 };

init();

if (window.location.hash === "#owner-login") {
  openLoginModal();
}

async function init() {
  applyUrlCategory();
  await loadSession();
  await Promise.all([loadVehicles(), loadSiteData()]);
  updateAdminUI();
  renderVehicles();
  if (!isEditingVehicle()) {
    resetVehicleFormState();
  }
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
    resetQuickFilters();
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
  resetQuickFilters();
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
    renderPhotoPreview(getPhotoPreviewImages());
    setVehicleFormMessage("");
    return;
  }

  const availableSlots = getAvailablePhotoSlots();

  if (availableSlots <= 0) {
    selectedPhotos = [];
    photoInput.value = "";
    renderPhotoPreview(getPhotoPreviewImages());
    setVehicleFormMessage("This vehicle already has 20 photos. Turn on replace photos to swap them.", "error");
    return;
  }

  setVehicleFormMessage("Preparing photos...");

  try {
    const photos = files.slice(0, availableSlots);
    selectedPhotos = await Promise.all(photos.map(resizeImage));
    renderPhotoPreview(getPhotoPreviewImages());
    setVehicleFormMessage(
      files.length > availableSlots
        ? `${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"} ready. Extra photos were skipped to stay within the 20 photo limit.`
        : buildPhotoReadyMessage(),
      "success"
    );
  } catch {
    selectedPhotos = [];
    photoInput.value = "";
    renderPhotoPreview(getPhotoPreviewImages());
    setVehicleFormMessage("Those photos could not be prepared. Try different photos.", "error");
  }
});

replacePhotosInput.addEventListener("change", () => {
  selectedPhotos = [];
  photoInput.value = "";
  renderPhotoPreview(getPhotoPreviewImages());
  setVehicleFormMessage(
    isEditingVehicle()
      ? replacePhotosInput.checked
        ? "Upload new photos to replace the current gallery."
        : "Upload new photos to add to the current gallery."
      : ""
  );
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
    authToken = String(session.token || authToken || "");
    syncStoredAuthToken();
    adminPasswordInput.value = "";
    resetVehicleFormState();
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
  authToken = "";
  syncStoredAuthToken();
  resetVehicleFormState();
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

  const vehicle = buildVehiclePayload();
  const requestPath = isEditingVehicle()
    ? `/api/vehicles/${encodeURIComponent(editingVehicleId)}`
    : "/api/vehicles";
  const requestMethod = isEditingVehicle() ? "PUT" : "POST";

  saveVehicleButton.disabled = true;
  saveVehicleButton.textContent = "Saving...";
  setVehicleFormMessage(isEditingVehicle() ? "Updating vehicle..." : "Saving vehicle...");

  try {
    await apiRequest(requestPath, {
      method: requestMethod,
      body: vehicle,
    });

    await loadVehicles();
    resetVehicleFormState();
    activeFilter = "all";
    setActiveFilter("all");
    renderVehicles();
    setVehicleFormMessage(
      requestMethod === "PUT"
        ? "Vehicle updated. The inventory now shows the latest details."
        : "Vehicle saved. It is now live in inventory.",
      "success"
    );
    document.querySelector("#inventory").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setVehicleFormMessage(
      error.message || (requestMethod === "PUT" ? "The vehicle could not be updated. Try again." : "The vehicle could not be saved. Try again."),
      "error"
    );
  } finally {
    saveVehicleButton.disabled = false;
    saveVehicleButton.textContent = getVehicleSubmitLabel();
  }
});

resetVehicleFormButton.addEventListener("click", () => {
  resetVehicleFormState();
  setVehicleFormMessage("");
});

cancelEditButton.addEventListener("click", () => {
  resetVehicleFormState();
  setVehicleFormMessage("Edit canceled. You can add a new vehicle now.", "success");
});

if (resetInventory) {
  resetInventory.addEventListener("click", async () => {
    if (!isAdmin) return;
    if (!apiAvailable) return;

    vehicles = await apiRequest("/api/reset", { method: "POST" });
    await loadSiteData();
    activeFilter = "all";
    setActiveFilter("all");
    renderVehicles();
  });
}

vehicleGrid.addEventListener("click", async (event) => {
  const editButton = event.target.closest(".edit-button");
  const soldButton = event.target.closest(".sold-button");
  const deleteButton = event.target.closest(".delete-button");

  if ((!editButton && !soldButton && !deleteButton) || !isAdmin) return;
  if (!apiAvailable) return;

  if (editButton) {
    startEditingVehicle(editButton.dataset.id);
    return;
  }

  if (soldButton) {
    const title = soldButton.dataset.title || "this vehicle";
    const confirmSold = window.confirm(`Mark ${title} as sold? It will stay in inventory with a sold badge.`);

    if (!confirmSold) {
      return;
    }

    setVehicleFormMessage(`Marking ${title} as sold...`);

    try {
      await apiRequest(`/api/vehicles/${encodeURIComponent(soldButton.dataset.id)}/sold`, { method: "POST" });
      await Promise.all([loadVehicles(), loadSiteData()]);
      renderVehicles();
      setVehicleFormMessage(`${title} was marked as sold.`, "success");
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

  if (editingVehicleId && deleteButton.dataset.id === editingVehicleId) {
    resetVehicleFormState();
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
    if (!isAdmin && authToken) {
      authToken = "";
      syncStoredAuthToken();
    }
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

async function loadSiteData() {
  try {
    siteData = sanitizeSiteData(await apiRequest("/api/site"));
    updateHeroStats();
    return;
  } catch {
    if (shouldUseStaticFallback()) {
      try {
        const response = await fetch("data/site.json", { cache: "no-store" });
        siteData = sanitizeSiteData(await response.json());
        updateHeroStats();
        return;
      } catch {
        siteData = sanitizeSiteData({});
        updateHeroStats();
        return;
      }
    }
  }

  siteData = sanitizeSiteData({});
  updateHeroStats();
}

async function apiRequest(url, options = {}) {
  const headers = {};

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(buildApiUrl(url), {
    method: options.method || "GET",
    credentials: apiBaseUrl ? "include" : "same-origin",
    headers,
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
    if (response.status === 401 && authToken) {
      authToken = "";
      syncStoredAuthToken();
    }
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function syncStoredAuthToken() {
  if (authToken) {
    window.localStorage.setItem("alejo_owner_token", authToken);
    return;
  }

  window.localStorage.removeItem("alejo_owner_token");
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
  const filterableVehicles = vehicles.filter((vehicle) => shouldShowVehicleInCurrentInventoryView(vehicle));
  const filteredVehicles = filterableVehicles.filter((vehicle) => {
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
  resultCount.textContent = `Showing ${visibleVehicles.length} of ${filterableVehicles.length} vehicles`;
  emptyState.hidden = visibleVehicles.length > 0;
  renderLotGallery(availableVehicles);
  updateHeroBackground(visibleVehicles[0] || availableVehicles[0] || vehicles[0]);
  updateHeroStats();

  visibleVehicles.forEach((vehicle) => {
    vehicleGrid.append(buildVehicleCard(vehicle));
  });
}

function sortVehicles(items) {
  const sortable = [...items];
  let comparator = () => 0;

  if (activeSort === "price-low") {
    comparator = (first, second) => compareKnownNumbers(parsePrice(first.price), parsePrice(second.price));
  } else if (activeSort === "price-high") {
    comparator = (first, second) => compareKnownNumbersDesc(parsePrice(first.price), parsePrice(second.price));
  } else if (activeSort === "mileage-low") {
    comparator = (first, second) => compareKnownNumbers(parseMileage(first.miles), parseMileage(second.miles));
  } else if (activeSort === "year-new") {
    comparator = (first, second) => compareKnownNumbersDesc(parseYear(first.year), parseYear(second.year));
  }

  return sortable.sort((first, second) => {
    const soldOrder = compareSoldStatus(first, second);
    return soldOrder || comparator(first, second);
  });
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

function compareSoldStatus(first, second) {
  const firstSold = isSoldVehicle(first);
  const secondSold = isSoldVehicle(second);

  if (firstSold === secondSold) {
    return 0;
  }

  return firstSold ? 1 : -1;
}

function updateHeroBackground(vehicle) {
  if (!heroSection || !vehicle) return;

  const image = getVehicleImages(vehicle)[0];

  if (image) {
    heroSection.style.setProperty("--hero-image", `url("${image}")`);
  }
}

function updateHeroStats() {
  if (!heroSoldCount) {
    return;
  }

  heroSoldCount.textContent = `${formatWholeNumber(siteData.vehiclesSold)}+ Vehicles Sold`;
}

function buildVehicleCard(vehicle) {
  const card = vehicleTemplate.content.firstElementChild.cloneNode(true);
  const title = getVehicleTitle(vehicle);
  const sold = isSoldVehicle(vehicle);
  const subtitleParts = [buildFamilyPitch(vehicle), formatCategory(vehicle.category)];
  const subtitle = subtitleParts.filter(Boolean).join(" - ");
  const image = card.querySelector("img");
  const detailUrl = `detail.html?id=${encodeURIComponent(vehicle.id)}`;
  const photoLink = card.querySelector(".vehicle-photo-link");
  const titleLink = card.querySelector(".vehicle-title");
  const price = card.querySelector(".vehicle-price");
  const detailsLink = card.querySelector(".details-link");
  const callLink = card.querySelector(".card-link");
  const messageLink = card.querySelector(".message-link");
  const cardActions = card.querySelector(".card-actions");
  const editButton = card.querySelector(".edit-button");
  const deleteButton = card.querySelector(".delete-button");
  const soldButton = card.querySelector(".sold-button");

  card.dataset.category = vehicle.category;
  image.src = getVehicleImages(vehicle)[0];
  image.alt = title || "Vehicle for sale";
  card.querySelector("h3").textContent = title || "Vehicle for Sale";
  card.querySelector(".vehicle-subtitle").textContent = sold ? `${subtitle || "Vehicle"} - Sold` : (subtitle || "Available now");
  price.textContent = sold ? "Sold" : formatPrice(vehicle.price);
  card.querySelector(".vehicle-specs").innerHTML = renderSpecs([
    ["Mileage", formatMileage(vehicle.miles, true)],
    ["Engine", vehicle.engine],
    ["Exterior Color", vehicle.exteriorColor],
    ["Transmission", vehicle.transmission],
    ["Interior Color", vehicle.interiorColor],
    ["Drivetrain", vehicle.drivetrain],
  ]);
  callLink.href = `tel:${phoneNumber}`;
  messageLink.href = buildSmsHref(title);

  soldButton.dataset.id = vehicle.id;
  soldButton.dataset.title = title || "this vehicle";
  editButton.dataset.id = vehicle.id;
  editButton.dataset.title = title || "this vehicle";
  deleteButton.dataset.id = vehicle.id;
  deleteButton.dataset.title = title || "this vehicle";

  if (sold) {
    const watermark = document.createElement("span");
    watermark.className = "sold-watermark inventory-sold-watermark";
    watermark.textContent = "SOLD";

    card.classList.add("is-sold");
    photoLink.classList.add("is-static");
    titleLink.classList.add("is-static");
    photoLink.removeAttribute("href");
    titleLink.removeAttribute("href");
    detailsLink.hidden = true;
    callLink.hidden = true;
    messageLink.hidden = true;
    soldButton.hidden = true;
    photoLink.append(watermark);
  } else {
    photoLink.href = detailUrl;
    titleLink.href = detailUrl;
    detailsLink.href = detailUrl;
    soldButton.hidden = !isAdmin;
  }

  editButton.hidden = !isAdmin;
  deleteButton.hidden = !isAdmin;
  cardActions.hidden = [...cardActions.children].every((element) => element.hidden);

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
  if (isSoldVehicle(vehicle) && activeQuickFilter !== "all") {
    return false;
  }

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

function isSoldVehicle(vehicle) {
  return String(vehicle.status || "").toLowerCase() === "sold";
}

function shouldShowVehicleInCurrentInventoryView(vehicle) {
  if (!isSoldVehicle(vehicle)) {
    return true;
  }

  return activeFilter === "all" && activeQuickFilter === "all";
}

function resetQuickFilters() {
  activeQuickFilter = "all";
  setActiveQuickFilter("all");
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

function buildVehiclePayload() {
  return {
    year: vehicleFormFields.year.value.trim(),
    make: vehicleFormFields.make.value.trim(),
    model: vehicleFormFields.model.value.trim(),
    category: vehicleFormFields.category.value,
    miles: vehicleFormFields.miles.value.trim(),
    price: vehicleFormFields.price.value.trim() || "Call for price",
    stockNumber: vehicleFormFields.stockNumber.value.trim(),
    vin: vehicleFormFields.vin.value.trim(),
    engine: vehicleFormFields.engine.value.trim(),
    transmission: vehicleFormFields.transmission.value.trim(),
    exteriorColor: vehicleFormFields.exteriorColor.value.trim(),
    interiorColor: vehicleFormFields.interiorColor.value.trim(),
    drivetrain: vehicleFormFields.drivetrain.value.trim(),
    fuelEconomy: vehicleFormFields.fuelEconomy.value.trim(),
    condition: vehicleFormFields.condition.value.trim(),
    damage: vehicleFormFields.damage.value.trim(),
    notes: vehicleFormFields.notes.value.trim(),
    status: editingVehicleStatus,
    soldAt: editingVehicleSoldAt,
    images: getVehicleImagesForSubmit(),
  };
}

function getVehicleImagesForSubmit() {
  const baseImages = isEditingVehicle() && !replacePhotosInput.checked ? editingVehicleImages : [];
  const combinedImages = [...baseImages, ...selectedPhotos].slice(0, photoLimit);

  if (combinedImages.length) {
    return combinedImages;
  }

  if (isEditingVehicle() && editingVehicleImages.length) {
    return editingVehicleImages;
  }

  return ["assets/alejo-motors-logo.svg"];
}

function getPhotoPreviewImages() {
  if (selectedPhotos.length) {
    return getVehicleImagesForSubmit();
  }

  if (isEditingVehicle() && editingVehicleImages.length) {
    return editingVehicleImages;
  }

  return [];
}

function getAvailablePhotoSlots() {
  if (!isEditingVehicle() || replacePhotosInput.checked) {
    return photoLimit;
  }

  return Math.max(photoLimit - editingVehicleImages.length, 0);
}

function buildPhotoReadyMessage() {
  if (!isEditingVehicle()) {
    return `${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"} ready.`;
  }

  if (replacePhotosInput.checked) {
    return `${selectedPhotos.length} replacement photo${selectedPhotos.length === 1 ? "" : "s"} ready.`;
  }

  const totalPhotos = Math.min(editingVehicleImages.length + selectedPhotos.length, photoLimit);
  return `${selectedPhotos.length} new photo${selectedPhotos.length === 1 ? "" : "s"} ready. This vehicle will have ${totalPhotos} photos total.`;
}

function isEditingVehicle() {
  return Boolean(editingVehicleId);
}

function getVehicleSubmitLabel() {
  return isEditingVehicle() ? "Update Vehicle" : "Save Vehicle";
}

function getVehicleTitle(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

function startEditingVehicle(vehicleId) {
  const vehicle = vehicles.find((item) => item.id === vehicleId);

  if (!vehicle) {
    setVehicleFormMessage("That vehicle could not be found for editing.", "error");
    return;
  }

  editingVehicleId = vehicle.id;
  editingVehicleImages = getVehicleImages(vehicle);
  editingVehicleStatus = vehicle.status || "available";
  editingVehicleSoldAt = vehicle.soldAt || "";
  selectedPhotos = [];
  photoInput.value = "";
  replacePhotosInput.checked = false;

  vehicleFormFields.year.value = vehicle.year || "";
  vehicleFormFields.make.value = vehicle.make || "";
  vehicleFormFields.model.value = vehicle.model || "";
  vehicleFormFields.category.value = vehicle.category || "car";
  vehicleFormFields.miles.value = vehicle.miles || "";
  vehicleFormFields.price.value = vehicle.price || "";
  vehicleFormFields.stockNumber.value = vehicle.stockNumber || "";
  vehicleFormFields.vin.value = vehicle.vin || "";
  vehicleFormFields.engine.value = vehicle.engine || "";
  vehicleFormFields.transmission.value = vehicle.transmission || "";
  vehicleFormFields.exteriorColor.value = vehicle.exteriorColor || "";
  vehicleFormFields.interiorColor.value = vehicle.interiorColor || "";
  vehicleFormFields.drivetrain.value = vehicle.drivetrain || "";
  vehicleFormFields.fuelEconomy.value = vehicle.fuelEconomy || "";
  vehicleFormFields.condition.value = vehicle.condition || "";
  vehicleFormFields.damage.value = vehicle.damage || "";
  vehicleFormFields.notes.value = vehicle.notes || "";

  updateVehicleFormUI();
  renderPhotoPreview(getPhotoPreviewImages());
  openOwnerArea();
  setVehicleFormMessage(`Editing ${getVehicleTitle(vehicle) || "vehicle"}. Update what you want and save when ready.`, "success");
}

function resetVehicleFormState() {
  clearVehicleFormFields();
  selectedPhotos = [];
  editingVehicleId = "";
  editingVehicleImages = [];
  editingVehicleStatus = "available";
  editingVehicleSoldAt = "";
  photoInput.value = "";
  replacePhotosInput.checked = false;
  updateVehicleFormUI();
  renderPhotoPreview([]);
}

function clearVehicleFormFields() {
  vehicleFormFields.year.value = "";
  vehicleFormFields.make.value = "";
  vehicleFormFields.model.value = "";
  vehicleFormFields.category.value = "car";
  vehicleFormFields.miles.value = "";
  vehicleFormFields.price.value = "";
  vehicleFormFields.stockNumber.value = "";
  vehicleFormFields.vin.value = "";
  vehicleFormFields.engine.value = "";
  vehicleFormFields.transmission.value = "";
  vehicleFormFields.exteriorColor.value = "";
  vehicleFormFields.interiorColor.value = "";
  vehicleFormFields.drivetrain.value = "";
  vehicleFormFields.fuelEconomy.value = "";
  vehicleFormFields.condition.value = "";
  vehicleFormFields.damage.value = "";
  vehicleFormFields.notes.value = "";
}

function updateVehicleFormUI() {
  const editing = isEditingVehicle();

  editModeBanner.hidden = !editing;
  cancelEditButton.hidden = !editing;
  replacePhotosWrap.hidden = !editing;
  saveVehicleButton.textContent = getVehicleSubmitLabel();

  if (editing) {
    const vehicleTitle = getVehicleTitle({
      year: vehicleFormFields.year.value,
      make: vehicleFormFields.make.value,
      model: vehicleFormFields.model.value,
    });
    editVehicleLabel.textContent = vehicleTitle
      ? `${vehicleTitle} is loaded below. Change any details, then save.`
      : "Change the details below, then save.";
    photoHelpText.textContent = "Leave photos empty to keep the current gallery. Upload more to add photos, or turn on replace photos to swap them out.";
    return;
  }

  editVehicleLabel.textContent = "Update the details below and save when ready.";
  photoHelpText.textContent = "Upload up to 20 photos for a new vehicle.";
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

function formatWholeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)).toLocaleString("en-US") : "50";
}

function sanitizeSiteData(data) {
  const count = Number(data.vehiclesSold);
  return {
    vehiclesSold: Number.isFinite(count) ? Math.max(50, Math.floor(count)) : 50,
  };
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
