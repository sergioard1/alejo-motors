import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "dist");
const port = Number(process.env.PORT || 4173);
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp" };

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/detail" || pathname === "/vehicle") pathname = "/detail.html";
  let target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) target = path.join(root, "404.html");
  try { if ((await stat(target)).isDirectory()) target = path.join(target, "index.html"); await stat(target); }
  catch { target = path.join(root, "404.html"); response.statusCode = 404; }
  const body = await readFile(target);
  response.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(body);
}).listen(port, "127.0.0.1", () => console.log(`Static preview: http://127.0.0.1:${port}`));
