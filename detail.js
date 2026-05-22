const params = new URLSearchParams(window.location.search);
const vehicleId = params.get("id");

const vehicleTop = document.querySelector("#vehicleTop");
const breadcrumbVehicle = document.querySelector("#breadcrumbVehicle");
const detailTitle = document.querySelector("#detailTitle");
const detailSubtitle = document.querySelector("#detailSubtitle");
const topText = document.querySelector("#topText");
const topPrice = document.querySelector("#topPrice");
const topMileage = document.querySelector("#topMileage");
const detailContent = document.querySelector("#detailContent");
const mainPhoto = document.querySelector("#mainPhoto");
const galleryThumbs = document.querySelector("#galleryThumbs");
const photoCount = document.querySelector("#photoCount");
const prevPhoto = document.querySelector("#prevPhoto");
const nextPhoto = document.querySelector("#nextPhoto");
const openLightbox = document.querySelector("#openLightbox");
const photoLightbox = document.querySelector("#photoLightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const closeLightbox = document.querySelector("#closeLightbox");
const lightboxPrev = document.querySelector("#lightboxPrev");
const lightboxNext = document.querySelector("#lightboxNext");
const infoGrid = document.querySelector("#infoGrid");
const fuelEconomyCard = document.querySelector("#fuelEconomyCard");
const notesSection = document.querySelector("#notesSection");
const detailNotes = document.querySelector("#detailNotes");
const requestForm = document.querySelector("#requestForm");
const messageInput = document.querySelector("#message");
const requestStatus = document.querySelector("#requestStatus");
const notFound = document.querySelector("#notFound");
const apiBaseUrl = window.ALEJO_API_BASE_URL || "";

let currentImages = [];
let currentIndex = 0;
let currentTitle = "";
let swipeStartX = null;
let swipeStartY = null;
let swipeSurface = null;
let suppressPhotoClick = false;

loadVehicle();

prevPhoto.addEventListener("click", () => showPhoto(currentIndex - 1));
nextPhoto.addEventListener("click", () => showPhoto(currentIndex + 1));
openLightbox.addEventListener("click", (event) => {
  if (suppressPhotoClick) {
    event.preventDefault();
    suppressPhotoClick = false;
    return;
  }

  openPhotoLightbox();
});
closeLightbox.addEventListener("click", closePhotoLightbox);
lightboxPrev.addEventListener("click", (event) => {
  event.stopPropagation();
  showPhoto(currentIndex - 1);
});
lightboxNext.addEventListener("click", (event) => {
  event.stopPropagation();
  showPhoto(currentIndex + 1);
});
photoLightbox.addEventListener("click", (event) => {
  if (event.target === photoLightbox) {
    closePhotoLightbox();
  }
});
bindSwipe(openLightbox);
bindSwipe(lightboxImage);

document.addEventListener("keydown", (event) => {
  const isLightboxOpen = !photoLightbox.hidden;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPhoto(currentIndex - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    showPhoto(currentIndex + 1);
  }

  if (event.key === "Escape" && isLightboxOpen) {
    closePhotoLightbox();
  }
});

requestForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const firstName = document.querySelector("#firstName").value.trim();
  const lastName = document.querySelector("#lastName").value.trim();
  const email = document.querySelector("#email").value.trim();
  const phone = document.querySelector("#phone").value.trim();
  const message = messageInput.value.trim();
  const tradeIn = document.querySelector("#tradeIn").checked ? "Yes" : "No";
  const lead = {
    vehicle: currentTitle,
    firstName,
    lastName,
    email,
    phone,
    tradeIn,
    message,
    page: window.location.href,
  };
  const smsText = [
    "Hi Alejo Motors, I would like more information.",
    `Vehicle: ${currentTitle}`,
    `Name: ${firstName} ${lastName}`,
    `Phone: ${phone}`,
    email ? `Email: ${email}` : "",
    `Trade-in: ${tradeIn}`,
    `Message: ${message}`,
    `Page: ${window.location.href}`,
  ].filter(Boolean).join("\n");

  saveLeadQuietly(lead);
  requestStatus.textContent = "Opening your text message app with the vehicle information ready.";
  window.location.href = `sms:+16789271739?body=${encodeURIComponent(smsText)}`;
});

async function loadVehicle() {
  if (!vehicleId) {
    showNotFound();
    return;
  }

  try {
    const response = await fetch(buildApiUrl(`/api/vehicles/${encodeURIComponent(vehicleId)}`));

    if (!response.ok) {
      await loadStaticVehicle();
      return;
    }

    const vehicle = await response.json();
    renderVehicle(vehicle);
  } catch {
    await loadStaticVehicle();
  }
}

function buildApiUrl(url) {
  return `${apiBaseUrl}${url}`;
}

function buildSmsHref(title = "this vehicle") {
  const message = `Hi Alejo Motors, I would like more information about ${title || "this vehicle"}.`;

  return `sms:+16789271739?body=${encodeURIComponent(message)}`;
}

function saveLeadQuietly(lead) {
  fetch(buildApiUrl("/api/leads"), {
    method: "POST",
    credentials: apiBaseUrl ? "include" : "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
    keepalive: true,
  }).catch(() => {
    // The SMS app is the primary path on mobile.
  });
}

async function loadStaticVehicle() {
  try {
    const response = await fetch("data/inventory.json", { cache: "no-store" });
    const vehicles = await response.json();
    const vehicle = vehicles.find((item) => item.id === vehicleId);

    if (!vehicle) {
      showNotFound();
      return;
    }

    renderVehicle(vehicle);
  } catch {
    showNotFound();
  }
}

function renderVehicle(vehicle) {
  const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle for Sale";
  const images = getVehicleImages(vehicle);

  currentImages = images;
  currentIndex = 0;
  currentTitle = title;
  document.title = `${title} for Sale in Fort Worth, TX | Alejo Motors`;
  detailTitle.textContent = title;
  detailSubtitle.textContent = buildSubtitle(vehicle);
  breadcrumbVehicle.textContent = [vehicle.make, vehicle.model].filter(Boolean).join(" / ") || "Vehicle";
  topPrice.textContent = formatPrice(vehicle.price, "Call");
  topMileage.textContent = formatMileage(vehicle.miles);
  topText.href = buildSmsHref(title);
  photoCount.textContent = `Photos (${images.length})`;
  messageInput.value = `Could you provide more information about this ${title}?`;

  galleryThumbs.innerHTML = "";
  images.forEach((src, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");

    button.type = "button";
    button.className = index === 0 ? "active" : "";
    image.src = src;
    image.alt = `${title} photo ${index + 1}`;
    button.append(image);
    button.addEventListener("click", () => showPhoto(index));
    galleryThumbs.append(button);
  });

  showPhoto(0);

  infoGrid.innerHTML = renderVehicleInfo(vehicle);
  renderFuelEconomy(vehicle.fuelEconomy);

  if (vehicle.notes) {
    detailNotes.textContent = vehicle.notes;
    notesSection.hidden = false;
  }

  vehicleTop.hidden = false;
  detailContent.hidden = false;
}

function showPhoto(index) {
  if (!currentImages.length) return;

  currentIndex = (index + currentImages.length) % currentImages.length;
  const src = currentImages[currentIndex];

  mainPhoto.src = src;
  mainPhoto.alt = `${currentTitle} photo ${currentIndex + 1}`;
  lightboxImage.src = src;
  lightboxImage.alt = mainPhoto.alt;
  galleryThumbs.querySelectorAll("button").forEach((button, index) => {
    button.classList.toggle("active", index === currentIndex);
  });
}

function openPhotoLightbox() {
  photoLightbox.hidden = false;
  showPhoto(currentIndex);
  closeLightbox.focus();
}

function closePhotoLightbox() {
  photoLightbox.hidden = true;
  openLightbox.focus();
}

function bindSwipe(surface) {
  surface.addEventListener("pointerdown", (event) => {
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeSurface = surface;
  });

  surface.addEventListener("pointermove", (event) => {
    if (swipeStartX === null) return;

    const deltaX = Math.abs(event.clientX - swipeStartX);
    const deltaY = Math.abs(event.clientY - swipeStartY);

    if (surface === openLightbox && (deltaX > 8 || deltaY > 8)) {
      suppressPhotoClick = true;
    }
  });

  surface.addEventListener("pointerup", (event) => {
    handleSwipeEnd(event, surface);
  });

  surface.addEventListener("pointercancel", resetSwipe);
}

function handleSwipeEnd(event, surface) {
  if (swipeStartX === null || swipeSurface !== surface) return;

  const deltaX = event.clientX - swipeStartX;
  const deltaY = event.clientY - swipeStartY;

  if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
    showPhoto(deltaX < 0 ? currentIndex + 1 : currentIndex - 1);
    event.preventDefault();

    if (surface === openLightbox) {
      suppressPhotoClick = true;
    }
  }

  resetSwipe();
}

function resetSwipe() {
  swipeStartX = null;
  swipeStartY = null;
  swipeSurface = null;
}

function showNotFound() {
  detailTitle.textContent = "Vehicle not found";
  notFound.hidden = false;
}

function getVehicleImages(vehicle) {
  if (Array.isArray(vehicle.images) && vehicle.images.length) {
    return vehicle.images;
  }

  return [vehicle.image || "assets/alejo-motors-logo.svg"];
}

function renderVehicleInfo(vehicle) {
  const rows = [
    { icon: "mileage", label: "Mileage", value: formatMileage(vehicle.miles, true) || "Call for information" },
    { icon: "car", label: "Condition", value: vehicle.condition || "Used" },
    { icon: "engine", label: "Engine", value: vehicle.engine || "Call for information" },
    { icon: "transmission", label: "Transmission", value: vehicle.transmission || "Call for information" },
    { icon: "drivetrain", label: "Drivetrain", value: vehicle.drivetrain || "Call for information" },
    { icon: "fuel", label: "Fuel", value: "Gasoline" },
    { icon: "paint", label: "Exterior Color", value: vehicle.exteriorColor || "Call for information" },
    { icon: "seat", label: "Interior Color", value: vehicle.interiorColor || "Call for information" },
    { icon: "hash", label: "Stock #", value: vehicle.stockNumber || "Call for information" },
    { icon: "vin", label: "VIN", value: vehicle.vin || "Call for information" },
  ];

  return rows
    .map(
      (row) => `
        <div class="vehicle-info-row">
          <span class="info-icon" aria-hidden="true">${renderIcon(row.icon)}</span>
          <div>
            <span class="info-label">${escapeHtml(row.label)}</span>
            <span class="info-value">${escapeHtml(row.value)}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderFuelEconomy(value) {
  const fuelEconomy = parseFuelEconomy(value);

  if (!fuelEconomy) {
    fuelEconomyCard.hidden = true;
    fuelEconomyCard.innerHTML = "";
    return;
  }

  fuelEconomyCard.innerHTML = `
    <p>Fuel Economy</p>
    <div class="fuel-economy-values">
      <div><span>City</span><strong>${escapeHtml(fuelEconomy.city)}</strong></div>
      <span class="fuel-pump" aria-hidden="true">${renderIcon("pump")}</span>
      <div><span>Hwy</span><strong>${escapeHtml(fuelEconomy.hwy)}</strong></div>
    </div>
  `;
  fuelEconomyCard.hidden = false;
}

function parseFuelEconomy(value) {
  const numbers = String(value || "").match(/\d+/g);

  if (!numbers || numbers.length < 2) {
    return null;
  }

  return {
    city: numbers[0],
    hwy: numbers[1],
  };
}

function buildSubtitle(vehicle) {
  const details = [
    vehicle.condition,
    formatCategory(vehicle.category),
    vehicle.exteriorColor,
  ];

  return details.filter(Boolean).join(" - ");
}

function formatMileage(value, includeUnit = false) {
  if (!value) return "Call";

  const number = Number(String(value).replace(/[^\d]/g, ""));

  if (!Number.isFinite(number) || number <= 0) {
    return value;
  }

  return `${number.toLocaleString("en-US")}${includeUnit ? " miles" : ""}`;
}

function formatPrice(value, fallback = "Call for price") {
  const cleanValue = String(value || "").trim();

  if (!cleanValue || cleanValue.toLowerCase() === "call for price") {
    return fallback;
  }

  const number = Number(cleanValue.replace(/[^\d.]/g, ""));

  if (!Number.isFinite(number) || number <= 0) {
    return cleanValue;
  }

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function renderIcon(name) {
  const icons = {
    car: '<svg viewBox="0 0 24 24"><path d="M5 11l2-5h10l2 5 1 1v5h-2v2h-3v-2H9v2H6v-2H4v-5l1-1zm3.3-3-1.1 3h9.6l-1.1-3H8.3zM7 14.5A1.5 1.5 0 1 0 7 17a1.5 1.5 0 0 0 0-2.5zm10 0A1.5 1.5 0 1 0 17 17a1.5 1.5 0 0 0 0-2.5z"/></svg>',
    mileage: '<svg viewBox="0 0 24 24"><path d="M12 5a9 9 0 0 1 9 9c0 2-.7 3.9-1.9 5.4H4.9A8.8 8.8 0 0 1 3 14a9 9 0 0 1 9-9zm0 2a7 7 0 0 0-6.6 9.4l.4 1h12.4l.4-1A7 7 0 0 0 12 7zm4.7 3.3 1.4 1.4-4.9 4.9a2 2 0 1 1-1.4-1.4l4.9-4.9zM6.5 13H9v2H6.5v-2zm8.5 0h2.5v2H15v-2z"/></svg>',
    engine: '<svg viewBox="0 0 24 24"><path d="M7 7h5V5H9V3h8v2h-3v2h2l2 2h2v3h2v5h-4l-3 3H8l-3-3H2v-6h3l2-4zm1.2 3-1.4 3H5v2h1.8l2 2h5.4l2-2H18v-3h-1.2l-2-2H8.2z"/></svg>',
    transmission: '<svg viewBox="0 0 24 24"><path d="M11 4a3 3 0 1 1 2 2.8V11h3V8h2v8h-2v-3h-3v4.2a3 3 0 1 1-2 0V6.8A3 3 0 0 1 11 4zm1 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0-16a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>',
    drivetrain: '<svg viewBox="0 0 24 24"><path d="M4 4h5v5H7v2h10V9h-2V4h5v5h-1v6h1v5h-5v-5h2v-2H7v2h2v5H4v-5h1V9H4V4zm2 2v1h1V6H6zm11 0v1h1V6h-1zM6 17v1h1v-1H6zm11 0v1h1v-1h-1z"/></svg>',
    fuel: '<svg viewBox="0 0 24 24"><path d="M4 20c4-8 9-12 16-13l1 2c-3 1-5 2-7 4l2 2-2 2-2-2c-2 2-4 4-6 6l-2-1z"/></svg>',
    paint: '<svg viewBox="0 0 24 24"><path d="M8 3h8v4l2 3v10H6V10l2-3V3zm2 2v2h4V5h-4zm-1 7v6h6v-6H9z"/></svg>',
    seat: '<svg viewBox="0 0 24 24"><path d="M8 3h5c2 0 3 1 3 3v5h3v5h-7v5H8v-8H6V6c0-2 1-3 2-3zm1 3v5h4V6H9z"/></svg>',
    hash: '<span class="hash-icon">#</span>',
    vin: '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3V6zm2 2v8h1V8H5zm3 0v8h2V8H8zm4 0v8h1V8h-1zm3 0v8h3V8h-3zm4 0v8h1V8h-1z"/></svg>',
    pump: '<svg viewBox="0 0 24 24"><path d="M6 3h9v18H5V3h1zm2 2v5h5V5H8zm8 2 3 3v7a1 1 0 0 0 2 0v-5h-2V9l-3-3V4l5 5v8a3 3 0 0 1-6 0V7h1z"/></svg>',
  };

  return icons[name] || "";
}

function formatCategory(category) {
  if (category === "car") return "Car";
  if (category === "suv") return "SUV";
  if (category === "pickup") return "Pick Up";
  return "Vehicle";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
