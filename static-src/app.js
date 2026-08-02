const config = window.ALEJO_CONFIG || {};
const phone = String(config.phone || "+16789271739");
const digits = phone.replace(/\D/g, "");
const grid = document.querySelector("#inventoryGrid");
const soldGrid = document.querySelector("#soldGrid");
const template = document.querySelector("#vehicleCardTemplate");
const state = document.querySelector("#inventoryState");
const search = document.querySelector("#inventorySearch");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
let snapshot = null;
let activeFilter = "all";

const text = (value) => String(value ?? "").trim();
const number = (value) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
const titleCase = (value) => text(value).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const transmission = (value) => /^aut$/i.test(text(value)) ? "Automatic" : text(value);
const photo = (vehicle, size = "card") => {
  const first = vehicle.photos?.[0];
  if (typeof first === "string") return first;
  return first?.[size] || first?.fallback || "";
};
const vehicleName = (vehicle) => `${vehicle.year || ""} ${titleCase(vehicle.make)} ${titleCase(vehicle.model)} ${text(vehicle.trim)}`.replace(/\s+/g, " ").trim();
const messageFor = (vehicle) => encodeURIComponent(`Hi Alejo Motors, I am interested in ${vehicleName(vehicle)}${vehicle.stock ? `, stock ${vehicle.stock}` : ""}. ${location.origin}/detail.html?id=${encodeURIComponent(vehicle.id)}`);
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number(value));
const miles = (value) => Number.isFinite(number(value)) && number(value) > 0 ? `${new Intl.NumberFormat("en-US").format(number(value))} mi` : text(value) || "Mileage unavailable";

function validSnapshot(value) {
  return value?.contract === "alejo-motors.public-inventory.v1" && value.schemaVersion === 1 && Array.isArray(value.vehicles) && value.vehicles.length > 0 && value.vehicles.every((vehicle) => vehicle.id && ["available", "sold"].includes(vehicle.status));
}

function card(vehicle, eager = false) {
  const node = template.content.firstElementChild.cloneNode(true);
  const detailUrl = `detail.html?id=${encodeURIComponent(vehicle.id)}`;
  const image = node.querySelector("img");
  image.alt = vehicleName(vehicle);
  image.src = photo(vehicle, "card") || "assets/vehicle-placeholder.svg";
  image.loading = eager ? "eager" : "lazy";
  image.fetchPriority = eager ? "high" : "auto";
  const first = vehicle.photos?.[0];
  if (first && typeof first === "object") {
    image.srcset = `${first.thumbnail} 400w, ${first.card} 800w, ${first.detail} 1400w`;
    image.sizes = "(max-width:680px) 100vw, (max-width:1020px) 50vw, 33vw";
  }
  node.querySelector("[data-role=detail]").href = detailUrl;
  const pill = node.querySelector(".status-pill"); pill.textContent = vehicle.status === "sold" ? "Sold" : "Available"; pill.classList.toggle("sold", vehicle.status === "sold");
  node.querySelector(".stock").textContent = vehicle.stock ? `Stock #${vehicle.stock}` : "Alejo Motors";
  node.querySelector("h3").textContent = vehicleName(vehicle);
  node.querySelector(".price").textContent = vehicle.status === "sold" ? "Sold" : money(vehicle.price);
  node.querySelector(".miles").textContent = miles(vehicle.mileage);
  node.querySelector(".title").textContent = text(vehicle.titleType);
  node.querySelector(".engine").textContent = text(vehicle.engine);
  node.querySelector(".transmission").textContent = transmission(vehicle.transmission);
  node.querySelector(".detail-link").href = detailUrl;
  const message = messageFor(vehicle);
  node.querySelector(".call-link").href = `tel:${phone}`;
  node.querySelector(".text-link").href = `sms:${phone}?&body=${message}`;
  node.querySelector(".whatsapp-link").href = `https://wa.me/${digits}?text=${message}`;
  return node;
}

function render() {
  if (!validSnapshot(snapshot)) return;
  const query = text(search.value).toLowerCase();
  const available = snapshot.vehicles.filter((vehicle) => vehicle.status === "available" && (activeFilter === "all" || vehicle.category === activeFilter) && `${vehicle.year} ${vehicle.make} ${vehicle.model}`.toLowerCase().includes(query));
  grid.replaceChildren(...available.map((vehicle, index) => card(vehicle, index < 3)));
  soldGrid.replaceChildren(...snapshot.vehicles.filter((vehicle) => vehicle.status === "sold").slice(0, 3).map((vehicle) => card(vehicle)));
  document.querySelector("#availableCount").textContent = String(snapshot.vehicles.filter((vehicle) => vehicle.status === "available").length);
  document.querySelector("#inventoryUpdated").textContent = snapshot.generatedAt ? `Updated ${new Date(snapshot.generatedAt).toLocaleString()}` : "Latest published inventory";
  state.hidden = available.length > 0;
  state.textContent = available.length ? "" : "No available vehicles match this search. Call or text us for help.";
}

async function fetchJson(url, cache = "no-cache") {
  const response = await fetch(url, { cache, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Inventory returned ${response.status}`);
  return response.json();
}

async function loadInventory() {
  let staticSnapshot = null;
  try { staticSnapshot = await fetchJson("data/public-inventory.json"); } catch {}
  if (validSnapshot(staticSnapshot)) {
    snapshot = staticSnapshot; localStorage.setItem("alejo-public-inventory-v1", JSON.stringify(snapshot)); render();
  } else {
    try { const saved = JSON.parse(localStorage.getItem("alejo-public-inventory-v1") || "null"); if (validSnapshot(saved)) { snapshot = saved; render(); } } catch {}
  }
  if (!snapshot) { state.hidden = false; state.textContent = "Inventory is temporarily unavailable. Please call, text or WhatsApp."; }
  if (!config.inventoryEndpoint) return;
  try {
    const live = await fetchJson(config.inventoryEndpoint, "no-store");
    if (validSnapshot(live) && (!snapshot || live.version >= snapshot.version)) {
      snapshot = live; localStorage.setItem("alejo-public-inventory-v1", JSON.stringify(live)); render();
    }
  } catch { /* The last valid static snapshot remains visible. */ }
}

filterButtons.forEach((button) => button.addEventListener("click", () => { activeFilter = button.dataset.filter; filterButtons.forEach((item) => item.classList.toggle("active", item === button)); render(); }));
search.addEventListener("input", render);
document.querySelector("#year").textContent = String(new Date().getFullYear());

const leadForm = document.querySelector("#leadForm");
const leadState = document.querySelector("#leadState");
let sending = false;
leadForm.addEventListener("submit", async (event) => {
  event.preventDefault(); if (sending) return;
  if (!leadForm.reportValidity()) return;
  if (!config.leadEndpoint) { leadState.textContent = "Online inquiries are not enabled in this preview. Please call, text or WhatsApp."; return; }
  const form = new FormData(leadForm);
  const payload = { requestId: crypto.randomUUID(), name: text(form.get("name")), phone: text(form.get("phone")), email: text(form.get("email")), stock: text(form.get("stock")), message: text(form.get("message")), tradeIn: form.get("tradeIn") === "on", website: text(form.get("website")), source: "Alejo Motors static site" };
  sending = true; leadForm.querySelector("button[type=submit]").disabled = true; leadState.textContent = "Sending…";
  try { const response = await fetch(config.leadEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(); leadForm.reset(); leadState.textContent = "Thank you. Alejo Motors received your inquiry."; }
  catch { leadState.textContent = "The form could not send. Please call, text or WhatsApp."; }
  finally { sending = false; leadForm.querySelector("button[type=submit]").disabled = false; }
});

void loadInventory();
