// POST /api/pix-receive — cria a cobrança Pix na MasterPag.
// Segurança: chaves só no servidor (env), validação de entrada, limite de requisições por IP,
// e nenhum detalhe interno é exposto em caso de erro.
const { BASE, authHeaders, ensureKeys } = require("./_masterpag");

// Rate limit best-effort por instância (reduz abuso/flood)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), janela = 60 * 1000, max = 15;
  const arr = (hits.get(ip) || []).filter(t => now - t < janela);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!ensureKeys(res)) return;

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconhecido";
  if (rateLimited(ip)) return res.status(429).json({ error: "Muitas tentativas. Aguarde um instante." });

  try {
    const body = req.body || {};
    const amount = Number(body.amount);
    const customer = body.customer || {};
    const items = body.items;

    // ---- validações de entrada ----
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000)
      return res.status(400).json({ error: "Valor inválido." });
    if (!customer.name || String(customer.name).trim().length < 2)
      return res.status(400).json({ error: "Nome do cliente inválido." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email || "")))
      return res.status(400).json({ error: "E-mail do cliente inválido." });
    const doc = String((customer.document && customer.document.number) || "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14)
      return res.status(400).json({ error: "CPF/CNPJ inválido." });
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "Itens do pedido ausentes." });

    const resp = await fetch(`${BASE}/pix-receive`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        amount,
        paymentMethod: "pix",
        customer,
        items,
        postbackUrl: process.env.WEBHOOK_URL || undefined,
      }),
    });
    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (e) {
    // não vaza stack/detalhe interno
    return res.status(502).json({ error: "Falha ao gerar a cobrança Pix. Tente novamente." });
  }
};
