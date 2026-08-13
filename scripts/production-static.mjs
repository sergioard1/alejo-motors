import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "dist");
const port = Number(process.env.PORT || 10000);
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp" };

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/detail" || pathname === "/vehicle") pathname = "/detail.html";
  if (pathname === "/sold" || pathname === "/sold-vehicles") pathname = "/sold.html";
  let target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) target = path.join(root, "404.html");
  try { if ((await stat(target)).isDirectory()) target = path.join(target, "index.html"); await stat(target); }
  catch { target = path.join(root, "404.html"); response.statusCode = 404; }
  response.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(await readFile(target));
}).listen(port, "0.0.0.0", () => console.log(`Alejo Motors catalog listening on ${port}`));
