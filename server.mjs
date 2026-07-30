import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import {
  DEFAULT_DEAL_SETTINGS,
  calculateDealPricing,
  calculatePayments,
  normalizeDealSettings,
} from "./deal-math.mjs";

const root = resolve(".");
const port = Number(process.env.PORT || 8080);
const adminEmail = process.env.ADMIN_EMAIL || "alejomotorstx@gmail.com";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || hashValue(process.env.ADMIN_PASSWORD || "");
const contactEmail = process.env.CONTACT_EMAIL || "alejomotorstx@gmail.com";
const contactPhone = process.env.CONTACT_PHONE || "+16789271739";
const dataRoot = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, "data");
const inventoryPath = join(dataRoot, "inventory.json");
const leadsPath = join(dataRoot, "leads.json");
const sitePath = join(dataRoot, "site.json");
const dealsPath = join(dataRoot, "deals.json");
const dealSettingsPath = join(dataRoot, "deal-settings.json");
const form130UPath = join(root, "assets", "dealer-documents", "form-130-u.pdf");
const purchaseAgreementTemplatePath = join(
  root,
  "assets",
  "dealer-documents",
  "vehicle-purchase-agreement-template.docx"
);
const billOfSaleTemplatePath = join(
  root,
  "assets",
  "dealer-documents",
  "bill-of-sale-template.docx"
);
const githubRepo = process.env.GITHUB_REPO || "";
const githubBranch = process.env.GITHUB_BRANCH || "main";
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const githubInventoryPath = process.env.GITHUB_INVENTORY_PATH || "data/inventory.json";
const githubSitePath = process.env.GITHUB_SITE_PATH || "data/site.json";
const githubDealsPath = process.env.GITHUB_DEALS_PATH || "data/deals.json";
const githubDealSettingsPath = process.env.GITHUB_DEAL_SETTINGS_PATH || "data/deal-settings.json";
const allowedOrigins = parseAllowedOrigins();
const sessions = new Set();
const revokedSessions = new Set();
const photoLimit = 20;
const defaultSiteData = { vehiclesSold: 50, pageVisits: 0 };
const vinDecodeBaseUrl = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended";
const censusGeocoderBaseUrl = "https://geocoding.geo.census.gov/geocoder/geographies/address";

const sampleVehicles = [
  {
    id: "nissan-versa-2010",
    year: "2010",
    make: "Nissan",
    model: "Versa 1.8S",
    category: "car",
    miles: "134,491 miles",
    price: "Call for price",
    notes: "Run & Drive - Original Texas title - Front-end damage - VIN: 3N1BC1CP6AL411912",
    stockNumber: "44906649",
    vin: "3N1BC1CP6AL411912",
    condition: "Run & Drive",
    damage: "Front End",
    exteriorColor: "Gray",
    images: ["assets/2010-nissan-versa.png"]
  },
  {
    id: "audi-q5-2015",
    year: "2015",
    make: "Audi",
    model: "Q5 Premium Plus",
    category: "suv",
    miles: "",
    price: "Call for price",
    notes: "Run & Drive - Lot #97965625 - VIN: WA1LFAFPXFA010327",
    stockNumber: "97965625",
    vin: "WA1LFAFPXFA010327",
    condition: "Run & Drive",
    exteriorColor: "Black",
    images: ["assets/2015-audi-q5-front.png", "assets/2015-audi-q5-side.png"]
  },
  {
    id: "black-suv",
    year: "",
    make: "Black",
    model: "2-Door SUV",
    category: "suv",
    miles: "",
    price: "Call for price",
    notes: "Available unit - Call to confirm year, model, mileage, and price",
    exteriorColor: "Black",
    images: ["assets/black-suv.png"]
  }
];

const types = {
  ".css": "text/css; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".mjs": "text/javascript; charset=utf-8"
};

ensureInventoryFile();
ensureLeadsFile();
ensureSiteFile();
ensureDealsFile();
ensureDealSettingsFile();

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      if (handleCors(request, response)) return;
      await handleApi(request, response, url);
      return;
    }

    serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    const status = Number(error.status || error.statusCode) || 500;
    const message = status === 500 ? "Server error. Please try again." : error.message;
    sendJson(response, status, { error: message });
  }
}).listen(port, () => {
  console.log(`ALEJO MOTORS running at http://localhost:${port}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      inventoryStorage: hasGitHubStorage() ? "github" : "local",
      emailConfigured: Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL),
      smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    sendJson(response, 200, { authenticated: isAuthenticated(request) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const emailMatches = String(body.email || "").trim().toLowerCase() === adminEmail.toLowerCase();
    const passwordHash = hashValue(String(body.password || ""));

    if (!adminPasswordHash || !emailMatches || passwordHash !== adminPasswordHash) {
      sendJson(response, 401, { error: "Invalid email or password" });
      return;
    }

    const token = createSessionToken(28800);
    sessions.add(token);
    response.setHeader("Set-Cookie", buildSessionCookie(request, token, 28800));
    sendJson(response, 200, { authenticated: true, token });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const token = getAuthToken(request);
    if (token) {
      sessions.delete(token);
      revokedSessions.add(token);
    }
    response.setHeader("Set-Cookie", buildSessionCookie(request, "", 0));
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/vehicles") {
    sendJson(response, 200, await readInventory());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/site") {
    sendJson(response, 200, await readSiteData());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/site/visit") {
    const siteData = await readSiteData();
    const nextSiteData = {
      ...siteData,
      pageVisits: Number(siteData.pageVisits || 0) + 1,
    };
    await writeSiteData(nextSiteData);
    sendJson(response, 200, {
      ok: true,
      pageVisits: nextSiteData.pageVisits,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/vin-decode") {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const vin = normalizeVinLookupInput(url.searchParams.get("vin"));
    const yearHint = normalizeModelYearHint(url.searchParams.get("year"));

    if (vin.length !== 17) {
      sendJson(response, 400, { error: "Enter a full 17-character VIN to autofill vehicle details." });
      return;
    }

    sendJson(response, 200, await decodeVinDetails(vin, yearHint));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/county-lookup") {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const address = {
      street: safeText(url.searchParams.get("street"), 180),
      city: safeText(url.searchParams.get("city"), 100),
      state: safeText(url.searchParams.get("state"), 2).toUpperCase(),
      zip: safeText(url.searchParams.get("zip"), 10),
    };

    if (!address.street || !address.city || address.state.length !== 2) {
      sendJson(response, 400, {
        error: "Street number and name, city, and two-letter state are required.",
      });
      return;
    }

    sendJson(response, 200, await lookupCounty(address));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/leads") {
    const lead = normalizeLead(await readJson(request));
    saveLead(lead);
    const delivery = await sendLeadNotifications(lead);
    sendJson(response, 200, { ok: true, stored: true, ...delivery });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/deal-settings") {
    requireAuth(request, response);
    if (response.writableEnded) return;
    sendJson(response, 200, await readDealSettings());
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/deal-settings") {
    requireAuth(request, response);
    if (response.writableEnded) return;
    const settings = normalizeDealSettings(await readJson(request));
    await writeDealSettings(settings);
    sendJson(response, 200, settings);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/deal-settings/reset") {
    requireAuth(request, response);
    if (response.writableEnded) return;
    await writeDealSettings(DEFAULT_DEAL_SETTINGS);
    sendJson(response, 200, DEFAULT_DEAL_SETTINGS);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/deals") {
    requireAuth(request, response);
    if (response.writableEnded) return;
    sendJson(response, 200, await readDeals());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/deals") {
    requireAuth(request, response);
    if (response.writableEnded) return;
    const deals = await readDeals();
    const deal = normalizeDeal(await readJson(request), await readDealSettings());
    deals.unshift(deal);
    await writeDeals(deals);
    sendJson(response, 201, deal);
    return;
  }

  const clientDocumentMatch = url.pathname.match(
    /^\/api\/deals\/([^/]+)\/(vehicle-purchase-agreement|bill-of-sale)\.docx$/
  );
  if (request.method === "GET" && clientDocumentMatch) {
    requireAuth(request, response);
    if (response.writableEnded) return;
    const dealId = decodeURIComponent(clientDocumentMatch[1]);
    const documentType = clientDocumentMatch[2];
    const deal = (await readDeals()).find((entry) => entry.id === dealId);

    if (!deal) {
      sendJson(response, 404, { error: "Deal not found" });
      return;
    }

    const document = createClientDocx(documentType, deal);
    const suffix =
      documentType === "vehicle-purchase-agreement"
        ? "vehicle-purchase-agreement"
        : "bill-of-sale";
    response.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${safeFilename(
        deal.dealNumber || deal.id
      )}-${suffix}.docx"`,
      "cache-control": "no-store",
    });
    response.end(document);
    return;
  }

  const form130UMatch = url.pathname.match(/^\/api\/deals\/([^/]+)\/form-130-u\.pdf$/);
  if (request.method === "GET" && form130UMatch) {
    requireAuth(request, response);
    if (response.writableEnded) return;
    const dealId = decodeURIComponent(form130UMatch[1]);
    const deal = (await readDeals()).find((entry) => entry.id === dealId);

    if (!deal) {
      sendJson(response, 404, { error: "Deal not found" });
      return;
    }

    const pdf = await createForm130U(deal);
    response.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${safeFilename(deal.dealNumber || deal.id)}-form-130-u.pdf"`,
      "cache-control": "no-store",
    });
    response.end(pdf);
    return;
  }

  const dealMatch = url.pathname.match(/^\/api\/deals\/([^/]+)$/);
  if (request.method === "PUT" && dealMatch) {
    requireAuth(request, response);
    if (response.writableEnded) return;
    const dealId = decodeURIComponent(dealMatch[1]);
    const deals = await readDeals();
    const dealIndex = deals.findIndex((entry) => entry.id === dealId);

    if (dealIndex < 0) {
      sendJson(response, 404, { error: "Deal not found" });
      return;
    }

    const deal = {
      ...normalizeDeal({ ...(await readJson(request)), id: dealId }, await readDealSettings()),
      createdAt: deals[dealIndex].createdAt,
      updatedAt: new Date().toISOString(),
    };
    deals[dealIndex] = deal;
    await writeDeals(deals);
    sendJson(response, 200, deal);
    return;
  }

  if (request.method === "DELETE" && dealMatch) {
    requireAuth(request, response);
    if (response.writableEnded) return;
    const dealId = decodeURIComponent(dealMatch[1]);
    const deals = (await readDeals()).filter((entry) => entry.id !== dealId);
    await writeDeals(deals);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/vehicles/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/vehicles/", ""));
    const vehicle = (await readInventory()).find((item) => item.id === id && item.status !== "sold");

    if (!vehicle) {
      sendJson(response, 404, { error: "Vehicle not found" });
      return;
    }

    sendJson(response, 200, migrateVehicle(vehicle));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/vehicles") {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const vehicle = await readJson(request);
    const vehicles = await readInventory();
    const cleanVehicle = await normalizeVehicle(vehicle, vehicles);
    vehicles.unshift(cleanVehicle);
    await writeInventory(vehicles);
    sendJson(response, 201, cleanVehicle);
    return;
  }

  if (request.method === "PUT" && url.pathname.startsWith("/api/vehicles/")) {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const id = decodeURIComponent(url.pathname.replace("/api/vehicles/", ""));
    const updatedVehicle = await readJson(request);
    const vehicles = await readInventory();
    const vehicleIndex = vehicles.findIndex((vehicle) => vehicle.id === id);

    if (vehicleIndex < 0) {
      sendJson(response, 404, { error: "Vehicle not found" });
      return;
    }

    vehicles[vehicleIndex] = await normalizeVehicleUpdate(vehicles[vehicleIndex], updatedVehicle, vehicles);
    await writeInventory(vehicles);
    sendJson(response, 200, migrateVehicle(vehicles[vehicleIndex]));
    return;
  }

  if (request.method === "POST" && url.pathname.endsWith("/sold") && url.pathname.startsWith("/api/vehicles/")) {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const id = decodeURIComponent(url.pathname.replace("/api/vehicles/", "").replace("/sold", ""));
    const vehicles = await readInventory();
    const vehicleIndex = vehicles.findIndex((vehicle) => vehicle.id === id);
    const siteData = await readSiteData();

    if (vehicleIndex < 0) {
      sendJson(response, 404, { error: "Vehicle not found" });
      return;
    }

    const wasSold = String(vehicles[vehicleIndex].status || "").trim().toLowerCase() === "sold";

    vehicles[vehicleIndex] = {
      ...vehicles[vehicleIndex],
      status: "sold",
      soldAt: String(vehicles[vehicleIndex].soldAt || "").trim() || new Date().toISOString()
    };

    await writeInventory(vehicles);
    if (!wasSold) {
      await writeSiteData({ vehiclesSold: siteData.vehiclesSold + 1 });
    }
    sendJson(response, 200, migrateVehicle(vehicles[vehicleIndex]));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/vehicles/")) {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const id = decodeURIComponent(url.pathname.replace("/api/vehicles/", ""));
    const vehicles = (await readInventory()).filter((vehicle) => vehicle.id !== id);
    await writeInventory(vehicles);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    requireAuth(request, response);
    if (response.writableEnded) return;

    await writeInventory(sampleVehicles);
    await writeSiteData(defaultSiteData);
    sendJson(response, 200, sampleVehicles);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  if (requestedPath.startsWith("/assets/dealer-documents/")) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function handleCors(request, response) {
  const origin = request.headers.origin || "";

  if (origin && isOriginAllowed(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return true;
  }

  return false;
}

function parseAllowedOrigins() {
  const defaults = [
    "http://localhost:8080",
    "http://localhost:8091",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8091",
    "https://sergioard1.github.io"
  ];
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...defaults, ...configured]);
}

function isOriginAllowed(origin) {
  return allowedOrigins.has(origin);
}

function readJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    let tooLarge = false;

    request.on("data", (chunk) => {
      if (tooLarge) return;

      raw += chunk;

      if (raw.length > 36_000_000) {
        tooLarge = true;
        raw = "";
      }
    });

    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("Photos are too large. Try fewer photos or smaller photos.");
        error.status = 413;
        rejectBody(error);
        return;
      }

      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        resolveBody({});
      }
    });

    request.on("error", rejectBody);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function ensureInventoryFile() {
  mkdirSync(dirname(inventoryPath), { recursive: true });

  if (!existsSync(inventoryPath)) {
    writeLocalInventory(sampleVehicles);
  }
}

function ensureLeadsFile() {
  mkdirSync(dirname(leadsPath), { recursive: true });

  if (!existsSync(leadsPath)) {
    writeFileSync(leadsPath, JSON.stringify([], null, 2));
  }
}

function ensureSiteFile() {
  mkdirSync(dirname(sitePath), { recursive: true });

  if (!existsSync(sitePath)) {
    writeLocalSiteData(defaultSiteData);
  }
}

function ensureDealsFile() {
  mkdirSync(dirname(dealsPath), { recursive: true });

  if (!existsSync(dealsPath)) {
    writeFileSync(dealsPath, JSON.stringify([], null, 2));
  }
}

function ensureDealSettingsFile() {
  mkdirSync(dirname(dealSettingsPath), { recursive: true });

  if (!existsSync(dealSettingsPath)) {
    writeFileSync(dealSettingsPath, JSON.stringify(DEFAULT_DEAL_SETTINGS, null, 2));
  }
}

async function readInventory() {
  if (hasGitHubStorage()) {
    return readGitHubInventory();
  }

  return readLocalInventory();
}

async function readSiteData() {
  if (hasGitHubStorage()) {
    return readGitHubSiteData();
  }

  return readLocalSiteData();
}

function readLocalInventory() {
  ensureInventoryFile();

  try {
    const data = JSON.parse(readFileSync(inventoryPath, "utf-8"));
    return Array.isArray(data) ? data.map(migrateVehicle) : sampleVehicles.map(migrateVehicle);
  } catch {
    writeLocalInventory(sampleVehicles);
    return sampleVehicles.map(migrateVehicle);
  }
}

async function writeInventory(vehicles) {
  const cleanVehicles = Array.isArray(vehicles) ? vehicles.map(migrateVehicle) : [];

  if (hasGitHubStorage()) {
    await writeGitHubInventory(cleanVehicles);
    return;
  }

  writeLocalInventory(cleanVehicles);
}

async function writeSiteData(siteData) {
  const cleanSiteData = migrateSiteData(siteData);

  if (hasGitHubStorage()) {
    await writeGitHubSiteData(cleanSiteData);
    return;
  }

  writeLocalSiteData(cleanSiteData);
}

function writeLocalInventory(vehicles) {
  mkdirSync(dirname(inventoryPath), { recursive: true });
  writeFileSync(inventoryPath, JSON.stringify(Array.isArray(vehicles) ? vehicles.map(migrateVehicle) : [], null, 2));
}

function readLocalSiteData() {
  ensureSiteFile();

  try {
    const data = JSON.parse(readFileSync(sitePath, "utf-8"));
    return migrateSiteData(data);
  } catch {
    writeLocalSiteData(defaultSiteData);
    return migrateSiteData(defaultSiteData);
  }
}

function writeLocalSiteData(siteData) {
  mkdirSync(dirname(sitePath), { recursive: true });
  writeFileSync(sitePath, JSON.stringify(migrateSiteData(siteData), null, 2));
}

function saveLead(lead) {
  ensureLeadsFile();

  let leads = [];
  try {
    const data = JSON.parse(readFileSync(leadsPath, "utf-8"));
    leads = Array.isArray(data) ? data : [];
  } catch {
    leads = [];
  }

  leads.unshift(lead);
  writeFileSync(leadsPath, JSON.stringify(leads.slice(0, 500), null, 2));
}

async function readDeals() {
  if (hasGitHubStorage()) {
    const data = await readGitHubJson(githubDealsPath, []);
    return Array.isArray(data) ? data.map((deal) => normalizeStoredDeal(deal)) : [];
  }

  ensureDealsFile();
  try {
    const data = JSON.parse(readFileSync(dealsPath, "utf-8"));
    return Array.isArray(data) ? data.map((deal) => normalizeStoredDeal(deal)) : [];
  } catch {
    writeFileSync(dealsPath, JSON.stringify([], null, 2));
    return [];
  }
}

async function writeDeals(deals) {
  const cleanDeals = Array.isArray(deals) ? deals.map((deal) => normalizeStoredDeal(deal)).slice(0, 1000) : [];

  if (hasGitHubStorage()) {
    await writeGitHubJson(githubDealsPath, cleanDeals, "Update Alejo Motors dealer deals");
    return;
  }

  ensureDealsFile();
  writeFileSync(dealsPath, JSON.stringify(cleanDeals, null, 2));
}

async function readDealSettings() {
  if (hasGitHubStorage()) {
    return normalizeDealSettings(await readGitHubJson(githubDealSettingsPath, DEFAULT_DEAL_SETTINGS));
  }

  ensureDealSettingsFile();
  try {
    return normalizeDealSettings(JSON.parse(readFileSync(dealSettingsPath, "utf-8")));
  } catch {
    writeFileSync(dealSettingsPath, JSON.stringify(DEFAULT_DEAL_SETTINGS, null, 2));
    return normalizeDealSettings(DEFAULT_DEAL_SETTINGS);
  }
}

async function writeDealSettings(settings) {
  const cleanSettings = normalizeDealSettings(settings);

  if (hasGitHubStorage()) {
    await writeGitHubJson(
      githubDealSettingsPath,
      cleanSettings,
      "Update Alejo Motors dealer fee settings"
    );
    return;
  }

  ensureDealSettingsFile();
  writeFileSync(dealSettingsPath, JSON.stringify(cleanSettings, null, 2));
}

function hasGitHubStorage() {
  return Boolean(githubRepo && githubToken);
}

async function readGitHubInventory() {
  const data = await githubApi(`repos/${githubRepo}/contents/${encodePath(githubInventoryPath)}?ref=${encodeURIComponent(githubBranch)}`);
  const json = await readGitHubFileContent(data);
  const vehicles = JSON.parse(json);
  return Array.isArray(vehicles) ? vehicles.map(migrateVehicle) : [];
}

async function readGitHubSiteData() {
  const data = await githubApi(
    `repos/${githubRepo}/contents/${encodePath(githubSitePath)}?ref=${encodeURIComponent(githubBranch)}`,
    { allowNotFound: true }
  );

  if (!data) {
    return migrateSiteData(defaultSiteData);
  }

  const json = await readGitHubFileContent(data);
  return migrateSiteData(JSON.parse(json));
}

async function writeGitHubInventory(vehicles) {
  const endpoint = `repos/${githubRepo}/contents/${encodePath(githubInventoryPath)}`;
  const existing = await githubApi(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`);
  const inventory = await prepareInventoryForStorage(Array.isArray(vehicles) ? vehicles.map(migrateVehicle) : []);
  const content = Buffer.from(JSON.stringify(inventory, null, 2)).toString("base64");

  await githubApi(endpoint, {
    method: "PUT",
    body: {
      message: "Update Alejo Motors inventory",
      content,
      branch: githubBranch,
      sha: existing.sha
    }
  });
}

async function writeGitHubSiteData(siteData) {
  const endpoint = `repos/${githubRepo}/contents/${encodePath(githubSitePath)}`;
  const existing = await githubApi(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, { allowNotFound: true });
  const content = Buffer.from(JSON.stringify(migrateSiteData(siteData), null, 2)).toString("base64");
  const body = {
    message: "Update Alejo Motors site data",
    content,
    branch: githubBranch,
  };

  if (existing?.sha) {
    body.sha = existing.sha;
  }

  await githubApi(endpoint, {
    method: "PUT",
    body,
  });
}

async function readGitHubJson(path, fallback) {
  const data = await githubApi(
    `repos/${githubRepo}/contents/${encodePath(path)}?ref=${encodeURIComponent(githubBranch)}`,
    { allowNotFound: true }
  );

  if (!data) return fallback;

  try {
    return JSON.parse(await readGitHubFileContent(data));
  } catch {
    return fallback;
  }
}

async function writeGitHubJson(path, value, message) {
  const endpoint = `repos/${githubRepo}/contents/${encodePath(path)}`;
  const existing = await githubApi(`${endpoint}?ref=${encodeURIComponent(githubBranch)}`, {
    allowNotFound: true,
  });
  const body = {
    message,
    content: Buffer.from(JSON.stringify(value, null, 2)).toString("base64"),
    branch: githubBranch,
  };

  if (existing?.sha) {
    body.sha = existing.sha;
  }

  await githubApi(endpoint, { method: "PUT", body });
}

async function readGitHubFileContent(data) {
  if (data.content && data.encoding === "base64") {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }

  if (data.download_url) {
    const response = await fetch(data.download_url, {
      headers: githubToken ? { Authorization: `Bearer ${githubToken}` } : {}
    });

    if (!response.ok) {
      throw new Error(`Could not download inventory with status ${response.status}`);
    }

    return response.text();
  }

  throw new Error("Inventory file is empty or unavailable.");
}

async function githubApi(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com/${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "alejo-motors-backend"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 404 && options.allowNotFound) {
      return null;
    }

    const error = new Error(data.message || `GitHub API failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function encodePath(value) {
  return String(value)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function migrateSiteData(siteData) {
  const vehiclesSold = Number(siteData?.vehiclesSold);
  const pageVisits = Number(siteData?.pageVisits);

  return {
    vehiclesSold: Number.isFinite(vehiclesSold) ? Math.max(50, Math.floor(vehiclesSold)) : 50,
    pageVisits: Number.isFinite(pageVisits) ? Math.max(0, Math.floor(pageVisits)) : 0,
  };
}

function normalizeVinLookupInput(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 17);
}

function normalizeModelYearHint(value) {
  const year = String(value || "").trim();
  return /^\d{4}$/.test(year) ? year : "";
}

async function decodeVinDetails(vin, modelYear = "") {
  const params = new URLSearchParams({ format: "json" });

  if (modelYear) {
    params.set("modelyear", modelYear);
  }

  const response = await fetch(`${vinDecodeBaseUrl}/${encodeURIComponent(vin)}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "alejo-motors-backend"
    }
  });

  if (!response.ok) {
    throw Object.assign(new Error("The VIN service is unavailable right now. Please try again in a moment."), {
      status: 502
    });
  }

  const payload = await response.json().catch(() => ({}));
  const decoded = Array.isArray(payload.Results) ? payload.Results[0] || {} : {};
  const fields = mapVinDecodedFields(decoded);

  if (!fields.year || !fields.make || !fields.model) {
    throw Object.assign(new Error("That VIN could not be decoded. Check the 17 characters and try again."), {
      status: 400
    });
  }

  const filledFields = Object.entries(fields)
    .filter(([, value]) => String(value || "").trim())
    .map(([key]) => key);
  const allFields = [
    "year",
    "make",
    "model",
    "category",
    "engine",
    "transmission",
    "drivetrain",
    "exteriorColor",
    "interiorColor",
    "fuelEconomy"
  ];

  return {
    vin,
    source: "NHTSA vPIC",
    title: [fields.year, fields.make, fields.model].filter(Boolean).join(" "),
    fields,
    filledFields,
    missingFields: allFields.filter((field) => !String(fields[field] || "").trim()),
    warnings: buildVinWarnings(decoded)
  };
}

function mapVinDecodedFields(decoded) {
  const year = cleanDecodedValue(decoded.ModelYear);
  const make = formatMake(cleanDecodedValue(decoded.Make));
  const model = [cleanDecodedValue(decoded.Model), cleanDecodedValue(decoded.Trim), cleanDecodedValue(decoded.Series)]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" ");
  const category = deriveCategoryFromVin(decoded);
  const engine = buildEngineLabel(decoded);
  const transmission = buildTransmissionLabel(decoded);
  const drivetrain = cleanDecodedValue(decoded.DriveType);
  const exteriorColor = cleanDecodedValue(decoded.ExteriorColor);
  const interiorColor = cleanDecodedValue(decoded.InteriorTrim);

  return {
    year,
    make,
    model,
    category,
    engine,
    transmission,
    drivetrain,
    exteriorColor,
    interiorColor,
    fuelEconomy: ""
  };
}

function buildVinWarnings(decoded) {
  const warnings = [];
  const errorText = cleanDecodedValue(decoded.ErrorText);

  if (errorText && errorText !== "0 - VIN decoded clean. Check Digit (9th position) is correct") {
    warnings.push(errorText);
  }

  if (!cleanDecodedValue(decoded.ExteriorColor) && !cleanDecodedValue(decoded.InteriorTrim)) {
    warnings.push("Color details were not included in the VIN response.");
  }

  return warnings;
}

function deriveCategoryFromVin(decoded) {
  const bodyClass = cleanDecodedValue(decoded.BodyClass).toLowerCase();
  const vehicleType = cleanDecodedValue(decoded.VehicleType).toLowerCase();

  if (/(pickup|truck)/.test(bodyClass) || vehicleType.includes("truck")) {
    return "pickup";
  }

  if (bodyClass.includes("sport utility") || bodyClass.includes("suv") || bodyClass.includes("crossover") || bodyClass.includes("mpv")) {
    return "suv";
  }

  return "car";
}

function buildEngineLabel(decoded) {
  const model = cleanDecodedValue(decoded.EngineModel);
  const displacement = formatDisplacement(cleanDecodedValue(decoded.DisplacementL));
  const cylinders = buildCylinderLabel(cleanDecodedValue(decoded.EngineConfiguration), cleanDecodedValue(decoded.EngineCylinders));
  const horsepower = cleanDecodedValue(decoded.EngineHP);
  const parts = [model, [displacement, cylinders].filter(Boolean).join(" "), horsepower ? `${horsepower} hp` : ""]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  return parts.join(" ").trim();
}

function buildTransmissionLabel(decoded) {
  const style = cleanDecodedValue(decoded.TransmissionStyle);
  const speeds = cleanDecodedValue(decoded.TransmissionSpeeds);

  if (style && speeds) {
    return `${style} ${speeds}-speed`;
  }

  return style || "";
}

function formatDisplacement(value) {
  if (!value) return "";
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return value;
  }

  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}L`;
}

function buildCylinderLabel(configuration, cylinders) {
  const count = Number(cylinders);

  if (!Number.isFinite(count) || count <= 0) {
    return "";
  }

  const layout = configuration.toLowerCase();

  if (layout.includes("v-shaped")) return `V${count}`;
  if (layout.includes("flat")) return `H${count}`;
  if (layout.includes("w")) return `W${count}`;
  return `I${count}`;
}

function formatMake(value) {
  if (!value) return "";

  const preservedMakes = new Set(["BMW", "GMC", "RAM", "MG", "BYD"]);
  if (preservedMakes.has(value.toUpperCase())) {
    return value.toUpperCase();
  }

  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function cleanDecodedValue(value) {
  const text = String(value || "").trim();

  if (!text || text.toLowerCase() === "not applicable") {
    return "";
  }

  return text;
}

async function normalizeVehicle(vehicle, existingVehicles = []) {
  const id = randomBytes(12).toString("hex");
  const images = Array.isArray(vehicle.images) ? vehicle.images : [];
  const uploadedImages = await prepareVehicleImages(id, images);
  const stockNumber = buildAutomaticStockNumber(existingVehicles);

  return {
    id,
    year: String(vehicle.year || "").trim(),
    make: String(vehicle.make || "").trim(),
    model: String(vehicle.model || "").trim(),
    category: ["car", "suv", "pickup"].includes(vehicle.category) ? vehicle.category : "car",
    miles: String(vehicle.miles || "").trim(),
    price: String(vehicle.price || "Call for price").trim(),
    notes: String(vehicle.notes || "").trim(),
    stockNumber,
    vin: String(vehicle.vin || "").trim(),
    condition: String(vehicle.condition || "").trim(),
    engine: String(vehicle.engine || "").trim(),
    transmission: String(vehicle.transmission || "").trim(),
    exteriorColor: String(vehicle.exteriorColor || "").trim(),
    interiorColor: String(vehicle.interiorColor || "").trim(),
    drivetrain: String(vehicle.drivetrain || "").trim(),
    fuelEconomy: String(vehicle.fuelEconomy || "").trim(),
    damage: String(vehicle.damage || "").trim(),
    status: "available",
    soldAt: "",
    images: uploadedImages.length ? uploadedImages : ["assets/alejo-motors-logo.svg"]
  };
}

async function normalizeVehicleUpdate(existingVehicle, vehicle, existingVehicles = []) {
  const currentVehicle = migrateVehicle(existingVehicle);
  const images = Array.isArray(vehicle.images) ? vehicle.images : [];
  const uploadedImages = images.length
    ? await prepareVehicleImages(currentVehicle.id, images)
    : getVehicleImages(currentVehicle);
  const status = String(vehicle.status || currentVehicle.status || "available").trim().toLowerCase() === "sold"
    ? "sold"
    : "available";
  const stockNumber = String(currentVehicle.stockNumber || "").trim()
    || buildAutomaticStockNumber(existingVehicles, currentVehicle.id);

  return {
    id: currentVehicle.id,
    year: String(vehicle.year || "").trim(),
    make: String(vehicle.make || "").trim(),
    model: String(vehicle.model || "").trim(),
    category: ["car", "suv", "pickup"].includes(vehicle.category) ? vehicle.category : currentVehicle.category,
    miles: String(vehicle.miles || "").trim(),
    price: String(vehicle.price || "Call for price").trim(),
    notes: String(vehicle.notes || "").trim(),
    stockNumber,
    vin: String(vehicle.vin || "").trim(),
    condition: String(vehicle.condition || "").trim(),
    engine: String(vehicle.engine || "").trim(),
    transmission: String(vehicle.transmission || "").trim(),
    exteriorColor: String(vehicle.exteriorColor || "").trim(),
    interiorColor: String(vehicle.interiorColor || "").trim(),
    drivetrain: String(vehicle.drivetrain || "").trim(),
    fuelEconomy: String(vehicle.fuelEconomy || "").trim(),
    damage: String(vehicle.damage || "").trim(),
    status,
    soldAt: status === "sold"
      ? String(vehicle.soldAt || currentVehicle.soldAt || new Date().toISOString()).trim()
      : "",
    images: uploadedImages.length ? uploadedImages : ["assets/alejo-motors-logo.svg"]
  };
}

function buildAutomaticStockNumber(vehicles, excludeVehicleId = "") {
  const numericValues = (Array.isArray(vehicles) ? vehicles : [])
    .map(migrateVehicle)
    .filter((vehicle) => vehicle.id !== excludeVehicleId)
    .map((vehicle) => String(vehicle.stockNumber || "").trim())
    .filter((value) => /^\d{6}$/.test(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 100001);

  const nextNumber = numericValues.length
    ? Math.max(...numericValues) + 1
    : 100001;

  return String(nextNumber);
}

async function prepareVehicleImages(vehicleId, images) {
  const cleanImages = images
    .map((image) => String(image || "").trim())
    .filter(Boolean)
    .slice(0, photoLimit);

  if (!hasGitHubStorage()) {
    return cleanImages;
  }

  const prepared = [];

  for (let index = 0; index < cleanImages.length; index += 1) {
    const image = cleanImages[index];

    if (!image.startsWith("data:image/")) {
      prepared.push(image);
      continue;
    }

    prepared.push(await uploadVehicleImage(vehicleId, image, index));
  }

  return prepared;
}

async function prepareInventoryForStorage(vehicles) {
  if (!hasGitHubStorage()) {
    return vehicles;
  }

  const prepared = [];

  for (const vehicle of vehicles) {
    prepared.push({
      ...vehicle,
      images: await prepareVehicleImages(vehicle.id, vehicle.images)
    });
  }

  return prepared;
}

async function uploadVehicleImage(vehicleId, dataUrl, index) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);

  if (!match) {
    throw Object.assign(new Error("One photo could not be read. Try a JPG or PNG image."), { status: 400 });
  }

  const mimeType = match[1];
  const content = match[2];
  const size = Buffer.byteLength(content, "base64");

  if (size > 4_000_000) {
    throw Object.assign(new Error("One photo is still too large. Try fewer or smaller photos."), { status: 413 });
  }

  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const path = `uploads/${vehicleId}/photo-${index + 1}-${suffix}.${extension}`;

  await githubApi(`repos/${githubRepo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: {
      message: "Add Alejo Motors vehicle photo",
      content,
      branch: githubBranch
    }
  });

  return `https://raw.githubusercontent.com/${githubRepo}/${githubBranch}/${path}`;
}

function getVehicleImages(vehicle) {
  const images = Array.isArray(vehicle.images) && vehicle.images.length
    ? vehicle.images
    : [vehicle.image || "assets/alejo-motors-logo.svg"];

  return images.map((image) => String(image || "").trim()).filter(Boolean);
}

function migrateVehicle(vehicle) {
  const images = getVehicleImages(vehicle);

  return {
    id: String(vehicle.id || randomBytes(12).toString("hex")),
    year: String(vehicle.year || ""),
    make: String(vehicle.make || ""),
    model: String(vehicle.model || ""),
    category: ["car", "suv", "pickup"].includes(vehicle.category) ? vehicle.category : "car",
    miles: String(vehicle.miles || ""),
    price: String(vehicle.price || "Call for price"),
    notes: String(vehicle.notes || ""),
    stockNumber: String(vehicle.stockNumber || ""),
    vin: String(vehicle.vin || ""),
    condition: String(vehicle.condition || ""),
    engine: String(vehicle.engine || ""),
    transmission: String(vehicle.transmission || ""),
    exteriorColor: String(vehicle.exteriorColor || ""),
    interiorColor: String(vehicle.interiorColor || ""),
    drivetrain: String(vehicle.drivetrain || ""),
    fuelEconomy: String(vehicle.fuelEconomy || ""),
    damage: String(vehicle.damage || ""),
    status: String(vehicle.status || "available").trim().toLowerCase() === "sold" ? "sold" : "available",
    soldAt: String(vehicle.soldAt || "").trim(),
    images: images.map((image) => String(image || "").trim()).filter(Boolean)
  };
}

function normalizeLead(lead) {
  return {
    id: randomBytes(12).toString("hex"),
    createdAt: new Date().toISOString(),
    vehicle: String(lead.vehicle || "Vehicle inquiry").trim(),
    firstName: String(lead.firstName || "").trim(),
    lastName: String(lead.lastName || "").trim(),
    email: String(lead.email || "").trim(),
    phone: String(lead.phone || "").trim(),
    tradeIn: String(lead.tradeIn || "No").trim(),
    message: String(lead.message || "").trim(),
    page: String(lead.page || "").trim()
  };
}

async function lookupCounty({ street, city, state, zip }) {
  const query = new URLSearchParams({
    street,
    city,
    state,
    zip,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Counties",
    format: "json",
  });
  const geocoderResponse = await fetch(`${censusGeocoderBaseUrl}?${query.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "alejo-motors-backend",
    },
  });

  if (!geocoderResponse.ok) {
    throw Object.assign(new Error("County lookup is temporarily unavailable."), { status: 502 });
  }

  const data = await geocoderResponse.json().catch(() => ({}));
  const match = data?.result?.addressMatches?.[0];
  const county =
    match?.geographies?.Counties?.[0] ||
    match?.geographies?.["County Subdivisions"]?.[0] ||
    null;
  const countyName = safeText(county?.NAME || county?.BASENAME, 100)
    .replace(/\s+County$/i, "")
    .trim();

  if (!countyName) {
    throw Object.assign(
      new Error("County was not found. Check the street, city, state, and ZIP code."),
      { status: 404 }
    );
  }

  return {
    county: countyName,
    matchedAddress: safeText(match?.matchedAddress, 240),
    source: "U.S. Census Geocoder",
  };
}

function createClientDocx(documentType, deal) {
  const templatePath =
    documentType === "vehicle-purchase-agreement"
      ? purchaseAgreementTemplatePath
      : billOfSaleTemplatePath;

  if (!existsSync(templatePath)) {
    throw Object.assign(new Error("Client document template is unavailable."), { status: 500 });
  }

  const zip = new PizZip(readFileSync(templatePath));
  const documentPart = zip.file("word/document.xml");
  if (!documentPart) {
    throw Object.assign(new Error("Client document template is invalid."), { status: 500 });
  }

  const replacements = {
    dealNumber: deal.dealNumber,
    saleDateLong: formatLongUsDate(deal.saleDate),
    totalPurchasePrice: formatDocumentMoney(deal.pricing.outTheDoor),
    buyerName: deal.customer.fullName,
    buyerAddress: formatCustomerAddress(deal.customer),
    buyerPhone: deal.customer.phone,
    buyerIdentification: formatCustomerIdentification(deal.customer),
    vehicleMake: deal.vehicle.make,
    vehicleModel: deal.vehicle.model,
    vehicleYear: deal.vehicle.year,
    vehicleVin: deal.vehicle.vin,
    vehicleMileage: deal.vehicle.miles,
    vehicleColor: deal.vehicle.color,
  };
  let xml = documentPart.asText();

  for (const [key, value] of Object.entries(replacements)) {
    xml = xml.replaceAll(`{${key}}`, escapeXml(value));
  }

  if (/\{[A-Za-z][A-Za-z0-9]*\}/.test(xml)) {
    throw Object.assign(new Error("A client document field could not be completed."), { status: 500 });
  }

  zip.file("word/document.xml", xml);
  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function normalizeDeal(input = {}, fallbackSettings = DEFAULT_DEAL_SETTINGS, preserveTimestamps = false) {
  const now = new Date().toISOString();
  const settings = normalizeDealSettings(input.settings || fallbackSettings);
  const requestedMode = input.pricing?.mode === "otd" ? "otd" : "base";
  const requestedAmount =
    requestedMode === "otd" ? input.pricing?.outTheDoor : input.pricing?.basePrice;
  const pricing = calculateDealPricing({
    mode: requestedMode,
    amount: requestedAmount,
    includeDealerProcessingFee: input.pricing?.includeDealerProcessingFee !== false,
    settings,
  });
  const payments = Array.isArray(input.payments)
    ? input.payments.slice(0, 200).map((payment) => ({
        id: safeText(payment.id, 80) || randomBytes(8).toString("hex"),
        type: payment.type === "deposit" ? "deposit" : "payment",
        amount: Math.max(0, safeMoney(payment.amount)),
        date: safeText(payment.date, 10),
        note: safeText(payment.note, 200),
      }))
    : [];
  const paymentTotals = calculatePayments(payments, pricing.outTheDoor);
  const id = safeText(input.id, 80) || randomBytes(12).toString("hex");
  const createdAt =
    preserveTimestamps && safeText(input.createdAt, 40) ? safeText(input.createdAt, 40) : now;

  return {
    id,
    dealNumber: safeText(input.dealNumber, 60) || createDealNumber(id),
    status: input.status === "completed" ? "completed" : "open",
    createdAt,
    updatedAt:
      preserveTimestamps && safeText(input.updatedAt, 40) ? safeText(input.updatedAt, 40) : now,
    vehicleId: safeText(input.vehicleId, 100),
    vehicle: {
      year: safeText(input.vehicle?.year, 4),
      make: safeText(input.vehicle?.make, 80),
      model: safeText(input.vehicle?.model, 120),
      vin: safeText(input.vehicle?.vin, 17).toUpperCase(),
      stockNumber: safeText(input.vehicle?.stockNumber, 60),
      miles: safeText(input.vehicle?.miles, 60),
      color: safeText(input.vehicle?.color, 80),
      bodyStyle: safeText(input.vehicle?.bodyStyle, 80),
    },
    customer: {
      fullName: safeText(input.customer?.fullName, 180),
      phone: safeText(input.customer?.phone, 50),
      email: safeText(input.customer?.email, 180),
      identificationType:
        safeText(input.customer?.identificationType, 80) || "U.S. Driver License/ID Card",
      identificationNumber: safeText(
        input.customer?.identificationNumber || input.customer?.identification,
        120
      ),
      identificationState: safeText(
        input.customer?.identificationState || input.customer?.idState,
        2
      ).toUpperCase(),
      streetAddress: safeText(
        input.customer?.streetAddress || input.customer?.address,
        180
      ),
      city: safeText(input.customer?.city, 100),
      state: safeText(input.customer?.state, 2).toUpperCase() || "TX",
      zip: safeText(input.customer?.zip, 10),
      county: safeText(input.customer?.county, 80),
    },
    saleDate: safeText(input.saleDate, 10) || now.slice(0, 10),
    settings,
    pricing,
    payments,
    paymentTotals,
    notes: safeText(input.notes, 2000),
  };
}

function normalizeStoredDeal(input = {}) {
  return normalizeDeal(input, input.settings || DEFAULT_DEAL_SETTINGS, true);
}

function safeText(value, maxLength = 300) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeMoney(value) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function createDealNumber(id) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `AM-${date}-${String(id).slice(-6).toUpperCase()}`;
}

function formatLongUsDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  });
}

function formatDocumentMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCustomerAddress(customer = {}) {
  const stateAndZip = [customer.state, customer.zip].filter(Boolean).join(" ");
  return [customer.streetAddress, customer.city, stateAndZip].filter(Boolean).join(", ");
}

function formatCustomerIdentification(customer = {}) {
  const type = safeText(customer.identificationType, 80);
  const state = safeText(customer.identificationState, 2).toUpperCase();
  const number = safeText(customer.identificationNumber, 120);
  return [type, state, number].filter(Boolean).join(" - ");
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function createForm130U(deal) {
  if (!existsSync(form130UPath)) {
    throw Object.assign(new Error("Form 130-U template is unavailable."), { status: 500 });
  }

  const pdf = await PDFDocument.load(readFileSync(form130UPath));
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const address = [
    deal.customer.streetAddress,
    deal.customer.city,
    deal.customer.state,
    deal.customer.zip,
  ]
    .filter(Boolean)
    .join(", ");
  const date = formatUsDate(deal.saleDate);
  const mileage = String(deal.vehicle.miles || "").replace(/\D/g, "");
  const money = (value) =>
    Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  setPdfText(form, "1 Vehicle Identification Number", deal.vehicle.vin);
  setPdfText(form, "2 Year", deal.vehicle.year);
  setPdfText(form, "3 Make", deal.vehicle.make);
  setPdfText(form, "4 Body Style", deal.vehicle.bodyStyle);
  setPdfText(form, "5 Model", deal.vehicle.model, 7);
  setPdfText(form, "6 Major Color", deal.vehicle.color);
  setPdfText(form, "9 Odometer Reading no tenths", mileage);
  setPdfText(form, "14 Applicant Photo ID Number or FEINEIN", deal.customer.identificationNumber);
  setPdfText(
    form,
    "16 Applicant First Name or Entity Name Middle Name Last Name Suffix if any",
    deal.customer.fullName
  );
  setPdfText(form, "18 Applicant Mailing Address City State Zip", address);
  setPdfText(form, "19 Applicant County of Residence", deal.customer.county);
  setPdfText(form, "20 Previous Owner Name or Entity Name City State", "ALEJO MOTORS, FORT WORTH, TX");
  setPdfText(form, "22. Unit Number (if applicable)", deal.vehicle.stockNumber);
  setPdfText(form, "25 Applicant Phone Number optional", deal.customer.phone);
  setPdfText(form, "26 Email optional", deal.customer.email);
  setPdfText(form, "Seller  Name", "ALEJO MOTORS");
  setPdfText(form, "Applicant Owner", deal.customer.fullName);
  setPdfText(form, "Date", date);
  setPdfText(form, "Date_2", date);
  setPdfText(form, "State Taxes Were Paid To", "Texas");
  setPdfText(form, "Sales Price Minus Rebate Amount", money(deal.pricing.basePrice));
  setPdfText(form, "Taxable Amount", money(deal.pricing.basePrice));
  setPdfText(form, "6.25% Tax on Taxable Amount", money(deal.pricing.taxAmount));
  setPdfText(form, "Amount of Tax and Penalty Due", money(deal.pricing.taxAmount));
  setPdfText(
    form,
    "State of ID/DL",
    deal.customer.identificationState || deal.customer.state
  );

  setPdfCheck(form, "Title  Registration");
  setPdfCheck(form, "Individual");
  setIdentificationTypeOnForm130U(form, deal.customer);
  setPdfCheck(form, "Sales and Use Tax");

  form.updateFieldAppearances(font);
  return Buffer.from(await pdf.save());
}

function setPdfText(form, fieldName, value, fontSizeOverride) {
  const text = String(value || "").trim();
  if (!text) return;

  try {
    const field = form.getTextField(fieldName);
    const maximum = field.getMaxLength();
    field.setText(maximum ? text.slice(0, maximum) : text);
    const fontSize =
      fontSizeOverride || (text.length > 45 ? 6 : text.length > 28 ? 7 : text.length > 18 ? 8 : 9);
    const appearance = `/Helvetica ${fontSize} Tf 0 g`;
    field.acroField.setDefaultAppearance(appearance);
    field.acroField.getWidgets().forEach((widget) => widget.setDefaultAppearance(appearance));
  } catch {
    // A form revision may omit an optional field; remaining fields still generate safely.
  }
}

function setPdfCheck(form, fieldName) {
  try {
    form.getCheckBox(fieldName).check();
  } catch {
    // A form revision may omit an optional checkbox.
  }
}

function setIdentificationTypeOnForm130U(form, customer = {}) {
  const type = String(customer.identificationType || "").toLowerCase();

  if (type.includes("passport")) {
    setPdfCheck(form, "Passport");
    setPdfText(form, "Passport Issued", customer.identificationState || customer.state);
    return;
  }

  if (type.includes("military")) {
    setPdfCheck(form, "US Military ID");
    return;
  }

  if (type.includes("homeland")) {
    setPdfCheck(form, "US Dept of Homeland Security ID");
    return;
  }

  if (type.includes("state")) {
    setPdfCheck(form, "US Dept of State ID");
    return;
  }

  if (type.includes("citizenship") || type.includes("immigration")) {
    setPdfCheck(form, "U.S. Citizenship & Immigration Services/DOJ ID");
    return;
  }

  setPdfCheck(form, "U.S. Driver License/ID Card");
}

function formatUsDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

function safeFilename(value) {
  return String(value || "alejo-motors")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function sendLeadNotifications(lead) {
  const [emailResult, smsResult] = await Promise.allSettled([
    sendLeadEmail(lead),
    sendLeadSms(lead)
  ]);

  return {
    sentEmail: emailResult.status === "fulfilled" && emailResult.value,
    sentSms: smsResult.status === "fulfilled" && smsResult.value
  };
}

async function sendLeadEmail(lead) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    return false;
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: contactEmail }] }],
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: "Alejo Motors Website" },
      reply_to: lead.email ? { email: lead.email, name: `${lead.firstName} ${lead.lastName}`.trim() } : undefined,
      subject: `Vehicle inquiry: ${lead.vehicle}`,
      content: [{ type: "text/plain", value: formatLeadMessage(lead) }]
    })
  });

  return response.ok;
}

async function sendLeadSms(lead) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return false;
  }

  const body = new URLSearchParams({
    From: from,
    To: contactPhone,
    Body: formatLeadMessage(lead).slice(0, 1500)
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  return response.ok;
}

function formatLeadMessage(lead) {
  return [
    `Vehicle: ${lead.vehicle}`,
    `Name: ${lead.firstName} ${lead.lastName}`.trim(),
    `Email: ${lead.email || "Not provided"}`,
    `Phone: ${lead.phone || "Not provided"}`,
    `Trade-in: ${lead.tradeIn || "No"}`,
    `Message: ${lead.message || "No message"}`,
    `Page: ${lead.page || "Not provided"}`,
    `Received: ${lead.createdAt}`
  ].join("\n");
}

function requireAuth(request, response) {
  if (!isAuthenticated(request)) {
    sendJson(response, 401, { error: "Login required" });
  }
}

function isAuthenticated(request) {
  const token = getAuthToken(request);
  return Boolean(
    token &&
      !revokedSessions.has(token) &&
      (sessions.has(token) || verifySessionToken(token))
  );
}

function getAuthToken(request) {
  const header = String(request.headers.authorization || "").trim();

  if (/^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }

  return getSessionToken(request);
}

function getSessionToken(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)alejo_session=([^;]+)/);
  return match ? match[1] : "";
}

function buildSessionCookie(request, token, maxAge) {
  const secure = isSecureRequest(request);
  const sameSite = process.env.CROSS_SITE_COOKIES === "true" ? "SameSite=None" : "SameSite=Lax";
  const secureFlag = secure || sameSite === "SameSite=None" ? "; Secure" : "";

  return `alejo_session=${token}; HttpOnly; ${sameSite}; Path=/; Max-Age=${maxAge}${secureFlag}`;
}

function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https" || String(request.headers.host || "").startsWith("https://");
}

function hashValue(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function createSessionToken(maxAgeSeconds) {
  const payload = Buffer.from(
    JSON.stringify({
      expiresAt: Date.now() + maxAgeSeconds * 1000,
      nonce: randomBytes(16).toString("hex"),
    })
  ).toString("base64url");
  const signature = createHmac("sha256", adminPasswordHash).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!adminPasswordHash) return false;

  const [payload, providedSignature, extra] = String(token || "").split(".");
  if (!payload || !providedSignature || extra) return false;

  const expectedSignature = createHmac("sha256", adminPasswordHash)
    .update(payload)
    .digest("base64url");
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return Number(data.expiresAt) > Date.now();
  } catch {
    return false;
  }
}
