// /api/pedidos — backend do painel administrativo.
//   GET   -> lista os pedidos (mais recentes primeiro)
//   POST  -> atualiza o status de um pedido  { id, status }  (ex.: "entregue", "cancelado")
//
// Protegido por senha no servidor. A senha é a constante ADMIN_TOKEN abaixo;
// o painel a envia no header Authorization: Bearer <senha>.
// (Opcional: defina ADMIN_TOKEN nas variáveis de ambiente da Vercel para
//  sobrescrever a senha sem mexer no código.)
const crypto = require("crypto");
const { storeReady, listOrders, patchOrder } = require("./_store");

// >>> SENHA DO PAINEL <<< — altere aqui para trocar a senha de acesso.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "orelhabean123";

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
  const esperado = ADMIN_TOKEN;
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

  if (!ADMIN_TOKEN)
    return res.status(500).json({ error: "Senha do painel não configurada no servidor." });
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
