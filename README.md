# Loja de bebidas + checkout MasterPag (Vercel)

Loja estática (`index.html` + `produtos.js` + `assets/`) com checkout integrado à **MasterPag** via funções serverless em `/api`. As chaves ficam **somente no servidor** — o frontend nunca expõe a `secret key`.

## Estrutura

```
index.html          frontend da loja e do checkout
produtos.js          catálogo de produtos
assets/              imagens de produtos e categorias
api/
  _masterpag.js      helper (base URL + headers de autenticação)
  pix-receive.js     POST  -> cria cobrança PIX
  pix-status.js      GET   -> consulta status (polling/fallback)
  card-receive.js    POST  -> cobrança no cartão (precisa de cardToken)
  webhook.js         POST  -> recebe notificações (valida HMAC-SHA256)
vercel.json
.env.example
```

## Deploy na Vercel

1. Suba a pasta para um repositório ou rode `vercel` pela CLI.
2. Em **Vercel → Settings → Environment Variables**, adicione:
   - `MASTERPAG_PUBLIC_KEY`
   - `MASTERPAG_SECRET_KEY`
   - `MASTERPAG_BASE_URL` (opcional, padrão `https://api.masterpag.com/functions/v1`)
   - `MASTERPAG_WEBHOOK_SECRET` (opcional, recomendado)
   - `WEBHOOK_URL` (ex.: `https://SEU-PROJETO.vercel.app/api/webhook`)
3. Deploy. As rotas ficam em `https://SEU-PROJETO.vercel.app/api/...`.

## Como funciona o checkout

- **Local (file://)** roda em **modo demonstração**: gera um QR fake e confirma o pedido na hora.
- **Hospedado (https)** chama as funções reais:
  - **PIX**: frontend → `/api/pix-receive` → mostra QR/copia-e-cola → polling em `/api/pix-status`.
  - **Cartão**: tokenização no frontend com SDK da MasterPag; só o `cardToken` vai para `/api/card-receive`.
