// POST /api/pix-receive  -> cria cobrança PIX na MasterPag e devolve QR Code + copia e cola
const { BASE, authHeaders, ensureKeys } = require("./_masterpag");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ensureKeys(res)) return;
  try {
    const { amount, customer, items } = req.body || {};
    if (!amount || !customer) return res.status(400).json({ error: "amount e customer são obrigatórios" });

    const r = await fetch(`${BASE}/pix-receive`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        amount,                 // valor em reais (confira no painel da MasterPag se é reais ou centavos)
        paymentMethod: "pix",
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
