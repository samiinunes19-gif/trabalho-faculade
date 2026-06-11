// POST /api/webhook  -> recebe notificações da MasterPag (charge.paid, charge.failed, etc.)
// Valida a assinatura HMAC-SHA256 e atualiza o pedido. Responda 2xx em até 30s.
const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const secret = process.env.MASTERPAG_WEBHOOK_SECRET;
  if (secret) {
    const raw = (req.headers["x-webhook-signature"] || "").replace("sha256=", "");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body || {}))
      .digest("hex");
    let ok = false;
    try {
      ok = raw.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(raw, "hex"), Buffer.from(expected, "hex"));
    } catch (_) {
      ok = false;
    }
    if (!ok) return res.status(401).json({ error: "assinatura inválida" });
  }

  const { event, data } = req.body || {};

  // TODO: atualizar o status do pedido no seu banco de dados conforme o evento.
  //   charge.paid     -> marcar pedido como pago e liberar a entrega
  //   charge.failed   -> cancelar/avisar o cliente
  //   charge.refunded -> registrar estorno
  console.log("[webhook] evento:", event, "->", data && (data.transaction_id || data.external_id));

  return res.status(200).json({ received: true });
};
