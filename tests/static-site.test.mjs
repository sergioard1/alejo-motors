import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { soldVehicleComparator } from "../scripts/catalog-order.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const privateKeys = ["vin", "purchasePrice", "expenses", "profit", "buyer", "payments", "privateNotes", "providers", "drive", "users"];

test("static catalog contains the last valid public inventory only", async () => {
  const snapshot = JSON.parse(await readFile(path.join(dist, "data", "public-inventory.json"), "utf8"));
  assert.equal(snapshot.contract, "alejo-motors.public-inventory.v1");
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.version, 0, "the bundled fallback must accept any newer manager snapshot");
  assert.ok(snapshot.vehicles.length > 0);
  assert.equal(snapshot.counts.total, snapshot.vehicles.length);
  assert.equal(snapshot.counts.available, snapshot.vehicles.filter((vehicle) => vehicle.status === "available").length);
  for (const vehicle of snapshot.vehicles) for (const key of privateKeys) assert.equal(Object.hasOwn(vehicle, key), false, `${key} must never be public`);
});

test("published output excludes dealer administration", async () => {
  const files = await readdir(dist, { recursive: true });
  const searchable = [];
  for (const relative of files.filter((file) => /\.(?:html|js|css|json)$/.test(file))) searchable.push(await readFile(path.join(dist, relative), "utf8"));
  const output = searchable.join("\n");
  assert.doesNotMatch(output, /Dealer Login|Deal Desk|Private deals|Manage inventory/i);
  assert.doesNotMatch(output, /ADMIN_PASSWORD|GITHUB_TOKEN|sk-proj-/i);
});

test("home prerenders available vehicles and only three sold vehicles", async () => {
  const html = await readFile(path.join(dist, "index.html"), "utf8");
  const inventory = html.match(/<div id="inventoryGrid"[\s\S]*?<\/div>\s*<p id="inventoryState"/)?.[0] || "";
  const sold = html.match(/<div id="soldGrid"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || "";
  assert.ok((inventory.match(/class="vehicle-card"/g) || []).length > 0);
  assert.equal((sold.match(/class="vehicle-card"/g) || []).length, 3);
  assert.doesNotMatch(sold, /href="tel:|href="sms:|wa\.me/);
});

test("sold vehicles have a searchable dedicated page with the full sold catalog", async () => {
  const snapshot = JSON.parse(await readFile(path.join(dist, "data", "public-inventory.json"), "utf8"));
  const html = await readFile(path.join(dist, "sold.html"), "utf8");
  assert.match(html, /<h1>SOLD VEHICLES<\/h1>/);
  assert.match(html, /id="soldSearch"/);
  assert.equal((html.match(/class="vehicle-card"/g) || []).length, snapshot.vehicles.filter((vehicle) => vehicle.status === "sold").length);
  assert.doesNotMatch(html.match(/<div id="allSoldGrid"[\s\S]*?<p id="soldState"/)?.[0] || "", /href="tel:|href="sms:|wa\.me/);
});

test("sold ordering uses valid sale dates, then deterministic update and ID fallback", () => {
  const vehicles = [
    { id: "z", soldAt: "", updatedAt: "2026-08-12" },
    { id: "b", soldAt: "invalid", updatedAt: "2026-08-13" },
    { id: "newer", soldAt: "2026-08-11", updatedAt: "2026-08-01" },
    { id: "older", soldAt: "2026-08-03", updatedAt: "2026-08-13" },
    { id: "a", soldAt: "", updatedAt: "2026-08-13" },
  ].sort(soldVehicleComparator);
  assert.deepEqual(vehicles.map((vehicle) => vehicle.id), ["newer", "older", "a", "b", "z"]);
});

test("every page exposes the complete requested catalog navigation", async () => {
  for (const file of ["index.html", "sold.html", "detail.html"]) {
    const html = await readFile(path.join(dist, file), "utf8");
    for (const label of ["All Inventory", "Cars", "SUVs", "Trucks", "Sold", "Contact"])
      assert.match(html, new RegExp(`>${label}<`), `${file} must link ${label}`);
  }
});

test("assets are fingerprinted and responsive images are smaller than originals", async () => {
  const html = await readFile(path.join(dist, "index.html"), "utf8");
  assert.match(html, /assets\/site-[a-f0-9]{10}\.css/);
  assert.match(html, /assets\/app-[a-f0-9]{10}\.js/);
  assert.match(html, /srcset=/);
  const snapshot = JSON.parse(await readFile(path.join(dist, "data", "public-inventory.json"), "utf8"));
  const first = snapshot.vehicles.find((vehicle) => vehicle.photos.length)?.photos[0];
  assert.ok(first);
  assert.ok((await stat(path.join(dist, first.thumbnail))).size < (await stat(path.join(dist, first.detail))).size);
});

test("static routes and cache policy are included", async () => {
  assert.match(await readFile(path.join(dist, "_redirects"), "utf8"), /\/detail \/detail\.html 200/);
  assert.match(await readFile(path.join(dist, "_headers"), "utf8"), /stale-while-revalidate/);
  assert.match(await readFile(path.join(dist, "_headers"), "utf8"), /immutable/);
});

test("vehicle details include contact fallback, lead capture and share metadata", async () => {
  const html = await readFile(path.join(dist, "detail.html"), "utf8");
  assert.match(html, /id="detailLeadForm"/);
  assert.match(html, /class="mobile-contact"/);
  assert.match(html, /property="og:title"/);
  const scripts = (await readdir(path.join(dist, "assets"))).filter((file) => file.startsWith("detail-") && file.endsWith(".js"));
  assert.equal(scripts.length, 1);
  assert.match(await readFile(path.join(dist, "assets", scripts[0]), "utf8"), /leadEndpoint/);
});

test("the public artifact contains neither VIN nor private sales and document modules", async () => {
  const files = await readdir(dist, { recursive: true });
  assert.equal(files.some((file) => /deal|buyer|invoice|sales-document|client-document/i.test(file)), false);
  const snapshot = await readFile(path.join(dist, "data", "public-inventory.json"), "utf8");
  assert.doesNotMatch(snapshot, /"vin"\s*:/i);
});
