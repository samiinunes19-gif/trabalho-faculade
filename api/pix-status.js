// GET /api/pix-status?transaction_id=...  -> consulta o status da cobrança (fallback/polling)
const { BASE, authHeaders, ensureKeys } = require("./_masterpag");

module.exports = async (req, res) => {
  if (!ensureKeys(res)) return;
  const id = req.query.transaction_id;
  if (!id) return res.status(400).json({ error: "transaction_id obrigatório" });
  try {
    const r = await fetch(`${BASE}/pix-receive?transaction_id=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
