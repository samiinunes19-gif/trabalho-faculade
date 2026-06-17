// Camada de persistência dos pedidos via Upstash Redis REST (compatível com Vercel KV).
// Não é uma rota (prefixo "_"). Usa só fetch — sem dependências npm.
//
// Variáveis de ambiente aceitas (defina UMA das duplas na Vercel):
//   KV_REST_API_URL / KV_REST_API_TOKEN              (integração Vercel KV)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash direto)

const URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const IDX = "pedidos:idx"; // sorted set: score = timestamp, member = id
const KEY = (id) => `pedido:${id}`;

function storeReady() {
  return Boolean(URL && TOKEN);
}

// Executa uma lista de comandos Redis em pipeline. Retorna array de resultados.
async function pipeline(cmds) {
  const r = await fetch(`${URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`KV pipeline ${r.status}`);
  const data = await r.json();
  // Upstash devolve [{result}, {error}] por comando
  return data.map((x) => (x && "result" in x ? x.result : null));
}

async function cmd(args) {
  const [res] = await pipeline([args]);
  return res;
}

// Cria/atualiza um pedido. `order` deve ter `id`.
async function saveOrder(order) {
  const id = String(order.id);
  const ts = Number(order.ts) || Date.now();
  await pipeline([
    ["SET", KEY(id), JSON.stringify(order)],
    ["ZADD", IDX, String(ts), id],
  ]);
  return order;
}

async function getOrder(id) {
  const raw = await cmd(["GET", KEY(id)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Atualiza campos de um pedido existente (merge raso). Cria stub se não existir
// (caso o webhook chegue antes do registro inicial, por algum motivo).
async function patchOrder(id, patch) {
  const atual = (await getOrder(id)) || { id: String(id), ts: Date.now() };
  const novo = { ...atual, ...patch };
  await saveOrder(novo);
  return novo;
}

// Lista os pedidos mais recentes (até `limit`).
async function listOrders(limit = 200) {
  const ids = await cmd(["ZRANGE", IDX, "0", String(limit - 1), "REV"]);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const raws = await cmd(["MGET", ...ids.map(KEY)]);
  return (raws || [])
    .map((raw) => {
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = { storeReady, saveOrder, getOrder, patchOrder, listOrders };
