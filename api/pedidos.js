// /api/pedidos — backend do painel administrativo.
//   GET   -> lista os pedidos (mais recentes primeiro)
//   POST  -> atualiza o status de um pedido  { id, status }  (ex.: "entregue", "cancelado")
//
// Protegido por senha REAL no servidor: defina ADMIN_TOKEN nas variáveis de ambiente
// da Vercel. O painel envia essa senha no header Authorization: Bearer <ADMIN_TOKEN>.
const crypto = require("crypto");
const { storeReady, listOrders, patchOrder } = require("./_store");

const STATUS_VALIDOS = ["pendente", "pago", "falhou", "estornado", "entregue", "cancelado"];

// Rate limit best-effort por IP (freia tentativa de adivinhar a senha)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), janela = 60 * 1000, max = 20;
  const arr = (hits.get(ip) || []).filter((t) => now - t < janela);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

function autorizado(req) {
  const esperado = process.env.ADMIN_TOKEN || "";
  if (!esperado) return false; // sem senha configurada, ninguém entra
  const recebido = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconhecido";
  if (rateLimited(ip)) return res.status(429).json({ error: "Muitas tentativas. Aguarde." });

  if (!process.env.ADMIN_TOKEN)
    return res.status(500).json({ error: "ADMIN_TOKEN não configurado no servidor." });
  if (!autorizado(req)) return res.status(401).json({ error: "Não autorizado." });
  if (!storeReady())
    return res.status(500).json({ error: "Armazenamento (KV) não configurado." });

  try {
    if (req.method === "GET") {
      const orders = await listOrders(300);
      return res.status(200).json({ orders });
    }
    if (req.method === "POST") {
      const { id, status } = req.body || {};
      if (!id || !STATUS_VALIDOS.includes(status))
        return res.status(400).json({ error: "id ou status inválido." });
      const pedido = await patchOrder(String(id), {
        status,
        atualizadoEm: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, pedido });
    }
    return res.status(405).json({ error: "Método não permitido." });
  } catch (e) {
    return res.status(502).json({ error: "Falha ao acessar os pedidos." });
  }
};
