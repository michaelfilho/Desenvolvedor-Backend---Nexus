# Nexus Wallet API

API REST para carteira cripto simplificada, com frontend estático para operação via navegador.

## Visão geral

- Cadastro, login, access token e refresh token
- Carteira criada automaticamente por usuário
- Saldos em `BRL`, `BTC`, `ETH`
- Depósito via webhook com idempotência
- Cotação e execução de swap com taxa fixa de 1.5%
- Saque com validação de saldo
- Ledger auditável e histórico de transações com paginação

## Stack

- Node.js + TypeScript
- Fastify
- Prisma ORM v7
- PostgreSQL (Neon em produção)
- Zod
- JWT
- Frontend estático (HTML, CSS e JS)

## Estrutura

```text
api/
  index.ts
prisma/
  schema.prisma
  semente.ts
public/
  index.html
  app.css
  app.js
src/
  aplicacao.ts
  servidor.ts
  config/
    ambiente.ts
  lib/
    autenticacao.ts
    cliente_prisma.ts
    decimal.ts
    erros.ts
    livro_razao.ts
    mercado.ts
  plugins/
    autenticacao.ts
  rotas/
    autenticacao.ts
    carteira.ts
    conversao.ts
    extrato_razao.ts
    saques.ts
    transacoes.ts
    webhooks_deposito.ts
```

## Variáveis de ambiente

Use o modelo abaixo no `.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
PORT="3000"
JWT_ACCESS_SECRET="change_this_access_secret_with_32_plus_chars"
JWT_REFRESH_SECRET="change_this_refresh_secret_with_32_plus_chars"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
COINGECKO_BASE_URL="https://api.coingecko.com/api/v3"
```

## Rodando localmente

1. Instale dependências

```bash
npm install
```

2. Gere o Prisma Client

```bash
npm run prisma:generate
```

3. Sincronize o schema no banco

```bash
npm run prisma:migrate
```

4. (Opcional) Rode o seed

```bash
npm run seed
```

5. Suba a API

```bash
npm run dev
```

6. Acesse

- API health: `http://localhost:3000/health`
- Frontend: `http://localhost:3000/`

## Conta de teste (seed)

- Email: `demo@nexus.com`
- Senha: `12345678`

## Deploy na Vercel (Neon)

1. Crie um banco PostgreSQL no Neon.
2. Configure as variáveis na Vercel (Settings > Environment Variables):
   - `DATABASE_URL`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `JWT_ACCESS_EXPIRES_IN`
   - `JWT_REFRESH_EXPIRES_IN`
   - `COINGECKO_BASE_URL`
3. Faça redeploy.
4. Garanta que o schema esteja aplicado no banco remoto com `npm run prisma:migrate`.

## Endpoints

### Autenticação

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`

### Carteira

- `GET /wallet/balances` (protegida)

### Depósito

- `POST /webhooks/deposit`

Payload:

```json
{
  "userId": "cuid_do_usuario",
  "token": "BRL",
  "amount": "100.50",
  "idempotencyKey": "deposito-001"
}
```

### Swap

- `POST /swap/quote` (protegida)
- `POST /swap` (protegida)

Payload:

```json
{
  "fromToken": "BTC",
  "toToken": "BRL",
  "amount": "0.5"
}
```

### Saque

- `POST /withdrawals` (protegida)

Payload:

```json
{
  "token": "BRL",
  "amount": "50"
}
```

### Ledger e transações

- `GET /ledger?page=1&pageSize=20` (protegida)
- `GET /transactions?page=1&pageSize=20` (protegida)

## Frontend

Tela disponível em `/`, com operações de:

- login/cadastro
- refresh/logout
- consulta de saldos
- depósito
- cotação e swap
- saque
- visualização de ledger e transações

## Comandos úteis

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run seed`
