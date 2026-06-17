// POST /api/webhook  -> recebe notificações da MasterPag (charge.paid, charge.failed, etc.)
// Valida a assinatura HMAC-SHA256 e atualiza o pedido. Responda 2xx em até 30s.
const crypto = require("crypto");
const { storeReady, patchOrder } = require("./_store");

// Mapeia o evento da MasterPag para o status do pedido no painel.
const STATUS_POR_EVENTO = {
  "charge.paid": "pago",
  "charge.failed": "falhou",
  "charge.refunded": "estornado",
  "charge.expired": "falhou",
};

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
  const id = data && (data.transaction_id || data.external_id || data.id);
  const novoStatus = STATUS_POR_EVENTO[event];

  // Atualiza o pedido no armazenamento (origem da verdade do painel).
  if (id && novoStatus && storeReady()) {
    try {
      await patchOrder(String(id), {
        status: novoStatus,
        pagoEm: novoStatus === "pago" ? new Date().toISOString() : undefined,
        atualizadoEm: new Date().toISOString(),
      });
    } catch (_) {
      // não falha o webhook por erro de armazenamento; a MasterPag re-tenta
    }
  }

  return res.status(200).json({ received: true });
};
