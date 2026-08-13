import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { transform } from "esbuild";
import sharp from "sharp";
import { publicVehicleComparator } from "./catalog-order.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(root, "static-src");
const outputDir = path.join(root, "dist");
const phone = process.env.CONTACT_PHONE || "+16789271739";
const digits = phone.replace(/\D/g, "");

const text = (value) => String(value ?? "").trim();
const number = (value) => Number(text(value).replace(/[^0-9.-]/g, "")) || 0;
const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const normalizeMake = (value) => text(value).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const normalizeTransmission = (value) => /^aut$/i.test(text(value)) ? "Automatic" : text(value);
const normalizeCategory = (value) => ({ truck: "pickup", pickups: "pickup", cars: "car", suvs: "suv" })[text(value).toLowerCase()] || text(value).toLowerCase() || "car";
const cleanDescription = (value) => text(value)
  .replace(/â€“/g, "–").replace(/â€”/g, "—").replace(/â€™/g, "’")
  .split(/\r?\n/)
  .filter((line) => !/(sincronizado desde|condici[oó]n publicada|rendimiento publicado|internal id|vehicle manager)/i.test(line))
  .join("\n").trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");

function localImagePath(url) {
  const raw = text(url);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const marker = "/main/";
    const relative = parsed.pathname.includes(marker) ? parsed.pathname.split(marker)[1] : parsed.pathname.replace(/^\//, "");
    return path.join(root, ...relative.split("/").map(decodeURIComponent));
  } catch {
    return path.join(root, raw.replace(/^[/\\]+/, ""));
  }
}

async function outputPhotos(vehicle) {
  const photos = [];
  for (const [index, original] of (vehicle.images || []).slice(0, 20).entries()) {
    let input;
    if (/^https?:\/\//i.test(text(original))) {
      try {
        const response = await fetch(original);
        if (!response.ok) continue;
        input = Buffer.from(await response.arrayBuffer());
      } catch { continue; }
    } else {
      input = localImagePath(original);
      try { await stat(input); } catch { continue; }
    }
    const base = `media/${vehicle.id}/${String(index + 1).padStart(2, "0")}`;
    const sizes = { thumbnail: [400, 68], card: [800, 76], detail: [1400, 82] };
    const item = {};
    for (const [variant, [width, quality]] of Object.entries(sizes)) {
      const relative = `${base}-${variant}.webp`;
      const destination = path.join(outputDir, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 4 }).toFile(destination);
      item[variant] = relative.replaceAll("\\", "/");
    }
    item.fallback = item.detail;
    photos.push(item);
  }
  return photos;
}

async function normalizeVehicle(vehicle) {
  const status = text(vehicle.status).toLowerCase() === "sold" ? "sold" : "available";
  const photos = await outputPhotos(vehicle);
  return {
    id: text(vehicle.publicId || vehicle.id), stock: text(vehicle.stockNumber || vehicle.stock),
    year: number(vehicle.year), make: normalizeMake(vehicle.make), model: text(vehicle.model), trim: text(vehicle.trim),
    category: normalizeCategory(vehicle.category), price: number(vehicle.price), mileage: number(vehicle.miles || vehicle.mileage),
    engine: text(vehicle.engine), transmission: normalizeTransmission(vehicle.transmission), bodyStyle: text(vehicle.bodyStyle),
    drivetrain: text(vehicle.drivetrain), fuelType: text(vehicle.fuelType || vehicle.fuel), exteriorColor: text(vehicle.exteriorColor),
    interiorColor: text(vehicle.interiorColor), titleType: text(vehicle.titleType || vehicle.title),
    description: cleanDescription(vehicle.publicDescription || vehicle.notes), status,
    publishedAt: text(vehicle.publishedAt), updatedAt: text(vehicle.updatedAt || vehicle.soldAt || vehicle.publishedAt),
    soldAt: status === "sold" ? text(vehicle.soldAt) : "", photos, primaryPhoto: photos[0]?.detail || "",
  };
}

function vehicleName(vehicle) { return `${vehicle.year || ""} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`.replace(/\s+/g, " ").trim(); }
function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0); }
function card(vehicle, eager = false) {
  if (vehicle.status === "sold") return soldCard(vehicle, eager);
  const detail = `detail.html?id=${encodeURIComponent(vehicle.id)}`;
  const first = vehicle.photos[0] || {};
  const contact = encodeURIComponent(`Hi Alejo Motors, I am interested in ${vehicleName(vehicle)}${vehicle.stock ? `, stock ${vehicle.stock}` : ""}.`);
  const image = first.card || "assets/vehicle-placeholder.svg";
  const srcset = first.thumbnail ? ` srcset="${first.thumbnail} 400w, ${first.card} 800w, ${first.detail} 1400w" sizes="(max-width:680px) 100vw, (max-width:1020px) 50vw, 33vw"` : "";
  const actions = `<a class="button primary detail-link" href="${detail}">View Details</a><a class="icon-action" href="tel:${phone}">Call</a><a class="icon-action" href="sms:${phone}?&body=${contact}">Text</a><a class="icon-action" href="https://wa.me/${digits}?text=${contact}" target="_blank" rel="noopener">WhatsApp</a>`;
  return `<article class="vehicle-card"><a class="vehicle-image" href="${detail}"><img width="800" height="600" src="${image}"${srcset} alt="${escapeHtml(vehicleName(vehicle))}" loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""}><span class="status-pill">Available</span></a><div class="vehicle-body"><span class="stock">${vehicle.stock ? `Stock #${escapeHtml(vehicle.stock)}` : "Alejo Motors"}</span><h3>${escapeHtml(vehicleName(vehicle))}</h3><strong class="price">${money(vehicle.price)}</strong><div class="specs"><span>${vehicle.mileage ? `${vehicle.mileage.toLocaleString("en-US")} mi` : "Mileage unavailable"}</span><span>${escapeHtml(vehicle.titleType)}</span><span>${escapeHtml(vehicle.engine)}</span><span>${escapeHtml(vehicle.transmission)}</span></div><div class="card-actions">${actions}</div></div></article>`;
}

function soldCard(vehicle, eager = false) {
  const first = vehicle.photos[0] || {};
  const image = first.card || "assets/vehicle-placeholder.svg";
  const srcset = first.thumbnail ? ` srcset="${first.thumbnail} 400w, ${first.card} 800w, ${first.detail} 1400w" sizes="(max-width:680px) 100vw, (max-width:1020px) 50vw, 33vw"` : "";
  return `<article class="vehicle-card sold-card"><div class="vehicle-image"><img width="800" height="600" src="${image}"${srcset} alt="${escapeHtml(vehicleName(vehicle))}" loading="${eager ? "eager" : "lazy"}" decoding="async"><span class="sold-watermark">SOLD</span></div><h3 class="sold-name">${escapeHtml(vehicleName(vehicle))}</h3></article>`;
}

async function hashedAsset(sourceName, outputStem) {
  const extension = path.extname(outputStem);
  const source = await readFile(path.join(sourceDir, sourceName), "utf8");
  const body = Buffer.from((await transform(source, {
    loader: extension === ".css" ? "css" : "js",
    minify: true,
    target: extension === ".css" ? undefined : "es2022",
  })).code);
  const stem = outputStem.slice(0, -extension.length);
  const outputName = `${stem}-${hash(body).slice(0, 10)}${extension}`;
  await writeFile(path.join(outputDir, "assets", outputName), body);
  return `assets/${outputName}`;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.join(outputDir, "assets"), { recursive: true });
await mkdir(path.join(outputDir, "data"), { recursive: true });
const raw = JSON.parse(await readFile(path.join(root, "data", "inventory.json"), "utf8"));
const vehicles = [];
for (const vehicle of raw) vehicles.push(await normalizeVehicle(vehicle));
vehicles.sort(publicVehicleComparator);
const generatedAt = new Date().toISOString();
const publicData = { contract: "alejo-motors.public-inventory.v1", schemaVersion: 1, version: 0, generatedAt, counts: { available: vehicles.filter((item) => item.status === "available").length, sold: vehicles.filter((item) => item.status === "sold").length, total: vehicles.length }, vehicles };
publicData.checksum = hash(JSON.stringify(publicData));
await writeFile(path.join(outputDir, "data", "public-inventory.json"), `${JSON.stringify(publicData, null, 2)}\n`);

const cssAsset = await hashedAsset("styles.css", "site.css");
const appAsset = await hashedAsset("app.js", "app.js");
const detailAsset = await hashedAsset("detail.js", "detail.js");
const soldAsset = await hashedAsset("sold.js", "sold.js");
await cp(path.join(root, "assets", "alejo-motors-logo.svg"), path.join(outputDir, "assets", "alejo-motors-logo.svg"));
await writeFile(path.join(outputDir, "assets", "vehicle-placeholder.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e9ecef"/><path d="M170 370h460l-45-120H260l-90 120Zm55 0a55 55 0 1 0 110 0 55 55 0 0 0-110 0Zm240 0a55 55 0 1 0 110 0 55 55 0 0 0-110 0Z" fill="#8b949d"/></svg>');
await writeFile(path.join(outputDir, "config.js"), `window.ALEJO_CONFIG=${JSON.stringify({ inventoryEndpoint: process.env.PUBLIC_INVENTORY_ENDPOINT || "", leadEndpoint: process.env.PUBLIC_LEAD_ENDPOINT || "", phone })};\n`);

const availableCards = vehicles.filter((item) => item.status === "available").map((item, index) => card(item, index < 3)).join("");
const featuredVehicle = vehicles.filter((item) => item.status === "available" && item.photos.length).sort(publicVehicleComparator)[0];
const featuredPhoto = featuredVehicle?.photos[0]?.detail ? `/${featuredVehicle.photos[0].detail}` : "/assets/vehicle-placeholder.svg";
const soldCards = vehicles.filter((item) => item.status === "sold").slice(0, 3).map((item) => card(item)).join("");
const allSoldCards = vehicles.filter((item) => item.status === "sold").map((item) => card(item)).join("");
let indexHtml = await readFile(path.join(sourceDir, "index.html"), "utf8");
indexHtml = indexHtml.replace("assets/site.css", cssAsset).replace("assets/app.js", appAsset).replace("assets/vehicle-placeholder.svg')", `${featuredPhoto}')`).replace("<!-- INVENTORY_CARDS -->", availableCards).replace("<!-- SOLD_CARDS -->", soldCards);
let detailHtml = await readFile(path.join(sourceDir, "detail.html"), "utf8");
detailHtml = detailHtml.replace("assets/site.css", cssAsset).replace("assets/detail.js", detailAsset);
let soldHtml = await readFile(path.join(sourceDir, "sold.html"), "utf8");
soldHtml = soldHtml.replace("assets/site.css", cssAsset).replace("assets/sold.js", soldAsset).replace("<!-- ALL_SOLD_CARDS -->", allSoldCards);
let notFoundHtml = await readFile(path.join(sourceDir, "404.html"), "utf8");
notFoundHtml = notFoundHtml.replace("assets/site.css", cssAsset);
await writeFile(path.join(outputDir, "index.html"), indexHtml);
await writeFile(path.join(outputDir, "detail.html"), detailHtml);
await writeFile(path.join(outputDir, "sold.html"), soldHtml);
await writeFile(path.join(outputDir, "404.html"), notFoundHtml);
await writeFile(path.join(outputDir, "_redirects"), "/detail /detail.html 200\n/vehicle /detail.html 200\n");
await writeFile(path.join(outputDir, "_headers"), `/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n/config.js\n  Cache-Control: public, max-age=60, must-revalidate\n/data/*\n  Cache-Control: public, max-age=60, stale-while-revalidate=86400\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/media/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/*\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  X-Content-Type-Options: nosniff\n`);
console.log(JSON.stringify({ outputDir, ...publicData.counts, originalVehicles: raw.length }, null, 2));
