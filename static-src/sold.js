const config = window.ALEJO_CONFIG || {};
const grid = document.querySelector("#allSoldGrid");
const search = document.querySelector("#soldSearch");
const state = document.querySelector("#soldState");
const text = (value) => String(value ?? "").trim();
let vehicles = [];

const valid = (snapshot) => snapshot?.contract === "alejo-motors.public-inventory.v1"
  && snapshot.schemaVersion === 1
  && Array.isArray(snapshot.vehicles)
  && snapshot.vehicles.length > 0;
const timestamp = (value) => {
  const parsed = Date.parse(text(value));
  return text(value) && Number.isFinite(parsed) ? parsed : null;
};
function soldOrder(left, right) {
  const leftSold = timestamp(left.soldAt);
  const rightSold = timestamp(right.soldAt);
  if (leftSold !== null || rightSold !== null) {
    if (leftSold === null) return 1;
    if (rightSold === null) return -1;
    if (leftSold !== rightSold) return rightSold - leftSold;
  }
  const leftUpdated = timestamp(left.updatedAt) ?? 0;
  const rightUpdated = timestamp(right.updatedAt) ?? 0;
  return rightUpdated - leftUpdated || text(left.id).localeCompare(text(right.id), "en");
}
function name(vehicle) {
  return `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.trim || ""}`.replace(/\s+/g, " ").trim();
}
function image(vehicle) {
  const first = vehicle.photos?.[0];
  return typeof first === "string" ? first : first?.card || first?.thumbnail || "assets/vehicle-placeholder.svg";
}
function card(vehicle) {
  const article = document.createElement("article");
  article.className = "vehicle-card";
  const detail = `detail.html?id=${encodeURIComponent(vehicle.id)}`;
  article.innerHTML = `<a class="vehicle-image" href="${detail}"><img width="800" height="600" loading="lazy" decoding="async" alt=""><span class="status-pill sold">Sold</span></a><div class="vehicle-body"><span class="stock"></span><h3></h3><strong class="price">Sold</strong><div class="specs"><span></span><span></span></div><div class="card-actions"><a class="button primary detail-link" href="${detail}">View Details</a></div></div>`;
  article.querySelector("img").src = image(vehicle);
  article.querySelector("img").alt = name(vehicle);
  article.querySelector(".stock").textContent = vehicle.stock ? `Stock #${vehicle.stock}` : "Alejo Motors";
  article.querySelector("h3").textContent = name(vehicle);
  const specs = article.querySelectorAll(".specs span");
  specs[0].textContent = vehicle.mileage ? `${Number(vehicle.mileage).toLocaleString("en-US")} mi` : "";
  specs[1].textContent = text(vehicle.titleType);
  return article;
}
function setSnapshot(snapshot) {
  vehicles = snapshot.vehicles.filter((vehicle) => vehicle.status === "sold").sort(soldOrder);
  localStorage.setItem("alejo-public-inventory-v1", JSON.stringify(snapshot));
  render();
}
function render() {
  const query = text(search.value).toLowerCase();
  const matches = vehicles.filter((vehicle) => name(vehicle).toLowerCase().includes(query));
  grid.replaceChildren(...matches.map(card));
  state.hidden = matches.length > 0;
  state.textContent = matches.length ? "" : "No sold vehicles match this search.";
}
async function fetchSnapshot(url, cache) {
  const response = await fetch(url, { cache, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Inventory returned ${response.status}`);
  return response.json();
}
async function load() {
  let current = null;
  try {
    const bundled = await fetchSnapshot("data/public-inventory.json", "no-cache");
    if (valid(bundled)) { current = bundled; setSnapshot(bundled); }
  } catch {}
  if (!current) {
    try {
      const saved = JSON.parse(localStorage.getItem("alejo-public-inventory-v1") || "null");
      if (valid(saved)) { current = saved; setSnapshot(saved); }
    } catch {}
  }
  if (!current) { state.hidden = false; state.textContent = "Sold inventory is temporarily unavailable."; }
  if (!config.inventoryEndpoint) return;
  try {
    const live = await fetchSnapshot(config.inventoryEndpoint, "no-store");
    if (valid(live) && (!current || live.version >= current.version)) setSnapshot(live);
  } catch { /* Keep the last valid catalog visible. */ }
}

search.addEventListener("input", render);
document.querySelector("#year").textContent = String(new Date().getFullYear());
void load();
