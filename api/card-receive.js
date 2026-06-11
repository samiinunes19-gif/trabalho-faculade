// POST /api/card-receive  -> cobrança no cartão de crédito.
// IMPORTANTE: o número do cartão NUNCA passa por aqui. O frontend tokeniza com o
// SDK da MasterPag e envia apenas o cardToken.
const { BASE, authHeaders, ensureKeys } = require("./_masterpag");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ensureKeys(res)) return;
  try {
    const { amount, cardToken, installments, customer, items } = req.body || {};
    if (!cardToken) return res.status(400).json({ error: "cardToken obrigatório (tokenize no frontend)" });

    const r = await fetch(`${BASE}/card-receive`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        amount,
        cardToken,
        installments: installments || 1,
        customer,
        items,
        postbackUrl: process.env.WEBHOOK_URL || undefined,
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
