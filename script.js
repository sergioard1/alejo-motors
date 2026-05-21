const phoneNumber = "+16789271739";

const vehicleGrid = document.querySelector("#vehicleGrid");
const vehicleTemplate = document.querySelector("#vehicleTemplate");
const emptyState = document.querySelector("#emptyState");
const resultCount = document.querySelector("#resultCount");
const inventorySearch = document.querySelector("#inventorySearch");
const bodyStyleSelect = document.querySelector("#bodyStyleSelect");
const vehicleForm = document.querySelector("#vehicleForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const resetInventory = document.querySelector("#resetInventory");
const filterButtons = document.querySelectorAll(".filter");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminMessage = document.querySelector("#adminMessage");
const adminPanel = document.querySelector("#adminPanel");
const logoutAdmin = document.querySelector("#logoutAdmin");
const loginModal = document.querySelector("#loginModal");
const openOwnerLogin = document.querySelector("#openOwnerLogin");
const closeOwnerLogin = document.querySelector("#closeOwnerLogin");

let vehicles = [];
let activeFilter = "all";
let searchTerm = "";
let selectedPhotos = [];
let isAdmin = false;
let apiAvailable = true;

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

openOwnerLogin?.addEventListener("click", openLoginModal);

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
    return;
  }

  selectedPhotos = await Promise.all(files.slice(0, 8).map(resizeImage));
  renderPhotoPreview(selectedPhotos);
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

  if (!isAdmin) return;
  if (!apiAvailable) return;

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
  document.querySelector("#inventory").scrollIntoView({ behavior: "smooth" });
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
  try {
    vehicles = await apiRequest("/api/vehicles");
    apiAvailable = true;
  } catch {
    apiAvailable = false;
    const response = await fetch("data/inventory.json", { cache: "no-store" });
    vehicles = await response.json();
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function renderVehicles() {
  const visibleVehicles = vehicles.filter((vehicle) => {
    const matchesCategory = activeFilter === "all" || vehicle.category === activeFilter;
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

    return matchesCategory && (!searchTerm || searchable.includes(searchTerm));
  });

  vehicleGrid.innerHTML = "";
  resultCount.textContent = `Showing ${visibleVehicles.length} of ${vehicles.length} vehicles`;
  emptyState.hidden = visibleVehicles.length > 0;

  visibleVehicles.forEach((vehicle) => {
    const card = vehicleTemplate.content.firstElementChild.cloneNode(true);
    const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
    const subtitle = [vehicle.condition, formatCategory(vehicle.category)].filter(Boolean).join(" - ");
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
    card.querySelector(".vehicle-price").textContent = vehicle.price || "Call for price";
    card.querySelector(".vehicle-specs").innerHTML = renderSpecs([
      ["Mileage", vehicle.miles],
      ["Engine", vehicle.engine],
      ["Exterior Color", vehicle.exteriorColor],
      ["Transmission", vehicle.transmission],
      ["Interior Color", vehicle.interiorColor],
      ["Drivetrain", vehicle.drivetrain],
    ]);
    card.querySelector(".details-link").href = detailUrl;
    card.querySelector(".card-link").href = `tel:${phoneNumber}`;

    const deleteButton = card.querySelector(".delete-button");
    deleteButton.dataset.id = vehicle.id;
    deleteButton.hidden = !isAdmin;

    vehicleGrid.append(card);
  });
}

function updateAdminUI() {
  const ownerMode = isOwnerMode();

  if (!ownerMode && window.location.hash === "#manager") {
    history.replaceState(null, "", "#inventory");
  }

  adminPanel.hidden = !ownerMode;

  document.querySelectorAll(".owner-only").forEach((element) => {
    element.hidden = !ownerMode;
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
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
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

function renderSpecs(specs) {
  return specs
    .filter(([, value]) => value)
    .slice(0, 6)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
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

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const maxWidth = 1200;
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };

      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
