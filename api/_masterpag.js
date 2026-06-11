// Helper compartilhado das funções serverless (não é uma rota — prefixo "_").
// As chaves ficam SOMENTE no servidor (variáveis de ambiente da Vercel).
const BASE = process.env.MASTERPAG_BASE_URL || "https://api.masterpag.com/functions/v1";

function authHeaders() {
  return {
    "x-public-key": process.env.MASTERPAG_PUBLIC_KEY || "",
    "x-secret-key": process.env.MASTERPAG_SECRET_KEY || "",
    "Content-Type": "application/json",
  };
}

function ensureKeys(res) {
  if (!process.env.MASTERPAG_PUBLIC_KEY || !process.env.MASTERPAG_SECRET_KEY) {
    res.status(500).json({
      error:
        "Chaves da MasterPag não configuradas. Defina MASTERPAG_PUBLIC_KEY e MASTERPAG_SECRET_KEY nas variáveis de ambiente da Vercel.",
    });
    return false;
  }
  return true;
}

module.exports = { BASE, authHeaders, ensureKeys };
