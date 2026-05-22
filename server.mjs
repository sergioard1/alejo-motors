import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { dirname, extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 8080);
const adminEmail = process.env.ADMIN_EMAIL || "alejomotorstx@gmail.com";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || hashValue(process.env.ADMIN_PASSWORD || "");
const contactEmail = process.env.CONTACT_EMAIL || "alejomotorstx@gmail.com";
const contactPhone = process.env.CONTACT_PHONE || "+16789271739";
const dataRoot = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, "data");
const inventoryPath = join(dataRoot, "inventory.json");
const leadsPath = join(dataRoot, "leads.json");
const githubRepo = process.env.GITHUB_REPO || "";
const githubBranch = process.env.GITHUB_BRANCH || "main";
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const githubInventoryPath = process.env.GITHUB_INVENTORY_PATH || "data/inventory.json";
const allowedOrigins = parseAllowedOrigins();
const sessions = new Set();

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
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

ensureInventoryFile();
ensureLeadsFile();

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

    const token = randomBytes(32).toString("hex");
    sessions.add(token);
    response.setHeader("Set-Cookie", buildSessionCookie(request, token, 28800));
    sendJson(response, 200, { authenticated: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const token = getSessionToken(request);
    if (token) sessions.delete(token);
    response.setHeader("Set-Cookie", buildSessionCookie(request, "", 0));
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/vehicles") {
    sendJson(response, 200, await readInventory());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/leads") {
    const lead = normalizeLead(await readJson(request));
    saveLead(lead);
    const delivery = await sendLeadNotifications(lead);
    sendJson(response, 200, { ok: true, stored: true, ...delivery });
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
    const cleanVehicle = await normalizeVehicle(vehicle);
    vehicles.unshift(cleanVehicle);
    await writeInventory(vehicles);
    sendJson(response, 201, cleanVehicle);
    return;
  }

  if (request.method === "POST" && url.pathname.endsWith("/sold") && url.pathname.startsWith("/api/vehicles/")) {
    requireAuth(request, response);
    if (response.writableEnded) return;

    const id = decodeURIComponent(url.pathname.replace("/api/vehicles/", "").replace("/sold", ""));
    const vehicles = await readInventory();
    const vehicleIndex = vehicles.findIndex((vehicle) => vehicle.id === id);

    if (vehicleIndex < 0) {
      sendJson(response, 404, { error: "Vehicle not found" });
      return;
    }

    vehicles[vehicleIndex] = {
      ...vehicles[vehicleIndex],
      status: "sold",
      soldAt: new Date().toISOString()
    };

    await writeInventory(vehicles);
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
    sendJson(response, 200, sampleVehicles);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
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

  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");

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

      if (raw.length > 24_000_000) {
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

async function readInventory() {
  if (hasGitHubStorage()) {
    return readGitHubInventory();
  }

  return readLocalInventory();
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

function writeLocalInventory(vehicles) {
  mkdirSync(dirname(inventoryPath), { recursive: true });
  writeFileSync(inventoryPath, JSON.stringify(Array.isArray(vehicles) ? vehicles.map(migrateVehicle) : [], null, 2));
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

function hasGitHubStorage() {
  return Boolean(githubRepo && githubToken);
}

async function readGitHubInventory() {
  const data = await githubApi(`repos/${githubRepo}/contents/${encodePath(githubInventoryPath)}?ref=${encodeURIComponent(githubBranch)}`);
  const json = await readGitHubFileContent(data);
  const vehicles = JSON.parse(json);
  return Array.isArray(vehicles) ? vehicles.map(migrateVehicle) : [];
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
    throw new Error(data.message || `GitHub API failed with ${response.status}`);
  }

  return data;
}

function encodePath(value) {
  return String(value)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function normalizeVehicle(vehicle) {
  const id = randomBytes(12).toString("hex");
  const images = Array.isArray(vehicle.images) ? vehicle.images : [];
  const uploadedImages = await prepareVehicleImages(id, images);

  return {
    id,
    year: String(vehicle.year || "").trim(),
    make: String(vehicle.make || "").trim(),
    model: String(vehicle.model || "").trim(),
    category: ["car", "suv", "pickup"].includes(vehicle.category) ? vehicle.category : "car",
    miles: String(vehicle.miles || "").trim(),
    price: String(vehicle.price || "Call for price").trim(),
    notes: String(vehicle.notes || "").trim(),
    stockNumber: String(vehicle.stockNumber || "").trim(),
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

async function prepareVehicleImages(vehicleId, images) {
  const cleanImages = images
    .map((image) => String(image || "").trim())
    .filter(Boolean)
    .slice(0, 6);

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

function migrateVehicle(vehicle) {
  const images = Array.isArray(vehicle.images) && vehicle.images.length
    ? vehicle.images
    : [vehicle.image || "assets/alejo-motors-logo.svg"];

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
  const token = getSessionToken(request);
  return Boolean(token && sessions.has(token));
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
