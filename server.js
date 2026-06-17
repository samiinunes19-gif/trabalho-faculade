// ============================================================================
//  Zé na Porta — BACKEND PRÓPRIO  (Node puro, sem dependências, sem Vercel)
// ----------------------------------------------------------------------------
//  Roda com:   node server.js
//  - Serve o site inteiro (index, checkout, painel, assets, produtos.js)
//  - API de pedidos com BANCO PRÓPRIO num arquivo: data/pedidos.json
//
//  Senha do painel: constante ADMIN_TOKEN abaixo (ou variável de ambiente).
//  Porta: variável PORT ou 3000.
// ============================================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pedidos.json");

// >>> SENHA DO PAINEL <<< — troque aqui para mudar a senha de acesso.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "orelhabean123";

const STATUS_VALIDOS = ["pendente", "pago", "falhou", "estornado", "entregue", "cancelado"];

// ---------- NOSSO BANCO: um arquivo JSON no disco ----------
function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
}
function readOrders() {
  ensureDb();
  try {
    const a = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function writeOrders(arr) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2));
}
function upsertOrder(order) {
  const arr = readOrders();
  const id = String(order.id);
  const i = arr.findIndex((p) => String(p.id) === id);
  if (i >= 0) arr[i] = { ...arr[i], ...order };
  else arr.unshift(order);
  writeOrders(arr);
  return order;
}
function patchStatus(id, status) {
  const arr = readOrders();
  const i = arr.findIndex((p) => String(p.id) === String(id));
  if (i < 0) return null;
  arr[i].status = status;
  arr[i].atualizadoEm = new Date().toISOString();
  writeOrders(arr);
  return arr[i];
}

// ---------- senha / autorização ----------
function autorizado(req) {
  const recebido = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  if (!recebido || !ADMIN_TOKEN) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// rate limit simples por IP (freia abuso)
const hits = new Map();
function rateLimited(ip, max = 60) {
  const now = Date.now(), janela = 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < janela);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

// ---------- helpers HTTP ----------
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function sendJson(res, status, obj) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy(); // 1MB máx
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0] || "/");
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath === "/administracao-dosclientes") urlPath = "/administracao-dosclientes.html";

  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(ROOT, safe);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("403"); }

  let ext = path.extname(file).toLowerCase();
  // rota "limpa" sem extensão e sem arquivo -> catálogo (ex.: /cervejas)
  if (!fs.existsSync(file) && ext === "" && !urlPath.startsWith("/api")) {
    file = path.join(ROOT, "index.html");
    ext = ".html";
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Arquivo não encontrado."); }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(buf);
  });
}

// ---------- servidor ----------
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  // ===================== API =====================
  if (url.startsWith("/api/")) {
    if (rateLimited(ip)) return sendJson(res, 429, { error: "Muitas requisições. Aguarde." });

    // GET /api/pedidos -> lista (protegido por senha)
    if (url === "/api/pedidos" && req.method === "GET") {
      if (!autorizado(req)) return sendJson(res, 401, { error: "Não autorizado." });
      const orders = readOrders().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return sendJson(res, 200, { orders });
    }

    // POST /api/pedidos -> cria/atualiza pedido (público: vem do checkout do cliente)
    if (url === "/api/pedidos" && req.method === "POST") {
      const body = await readBody(req);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000)
        return sendJson(res, 400, { error: "Valor inválido." });
      const c = body.cliente || {};
      const order = {
        id: String(body.id || ("ped-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"))),
        ts: Number(body.ts) || Date.now(),
        criadoEm: body.criadoEm || new Date().toISOString(),
        status: STATUS_VALIDOS.includes(body.status) ? body.status : "pendente",
        amount,
        cliente: {
          nome: String(c.nome || "").slice(0, 120),
          email: String(c.email || "").slice(0, 160),
          telefone: String(c.telefone || "").replace(/\D/g, "").slice(0, 15),
          cpf: String(c.cpf || "").replace(/\D/g, "").slice(0, 14),
        },
        itens: Array.isArray(body.itens) ? body.itens.slice(0, 200) : [],
        entrega: String(body.entrega || "").slice(0, 400),
      };
      const saved = upsertOrder(order);
      return sendJson(res, 200, { ok: true, id: saved.id });
    }

    // POST /api/pedidos/status -> atualiza status (protegido por senha)
    if (url === "/api/pedidos/status" && req.method === "POST") {
      if (!autorizado(req)) return sendJson(res, 401, { error: "Não autorizado." });
      const body = await readBody(req);
      if (!body.id || !STATUS_VALIDOS.includes(body.status))
        return sendJson(res, 400, { error: "id ou status inválido." });
      const upd = patchStatus(String(body.id), body.status);
      if (!upd) return sendJson(res, 404, { error: "Pedido não encontrado." });
      return sendJson(res, 200, { ok: true, pedido: upd });
    }

    return sendJson(res, 404, { error: "Rota de API não encontrada." });
  }

  // ===================== SITE (estático) =====================
  if (req.method !== "GET") { res.writeHead(405); return res.end("405"); }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  ensureDb();
  console.log("\n  ╔══════════════════════════════════════════════╗");
  console.log("  ║   Zé na Porta — backend próprio no ar         ║");
  console.log("  ╚══════════════════════════════════════════════╝");
  console.log(`  Site:   http://localhost:${PORT}`);
  console.log(`  Painel: http://localhost:${PORT}/administracao-dosclientes`);
  console.log(`  Senha do painel: ${ADMIN_TOKEN}`);
  console.log(`  Banco (arquivo): ${DB_FILE}\n`);
});
