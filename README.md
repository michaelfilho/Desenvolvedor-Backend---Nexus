# Nexus Wallet API

API REST para carteira cripto simplificada, desenvolvida para o teste prático de Backend (Nexus).

O projeto prioriza:

- modelagem consistente de dados
- rastreabilidade de saldo via ledger
- regras de negócio transacionais
- clareza de código e documentação

## Resumo funcional

- Autenticação com cadastro, login, access token e refresh token
- Carteira criada automaticamente no cadastro
- Suporte a `BRL`, `BTC`, `ETH`
- Depósito via webhook com idempotência
- Cotação de swap com CoinGecko + taxa fixa de 1.5%
- Execução de swap com débito/crédito e lançamento no ledger
- Saque com validação de saldo
- Extrato de movimentações (ledger) com paginação
- Histórico de transações com paginação

## Stack

- Node.js + TypeScript
- Fastify
- PostgreSQL
- Prisma ORM (v7)
- Zod (validação)
- JWT (access/refresh)

## Estrutura do projeto

```text
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
  types/
    fastify.d.ts
prisma/
  schema.prisma
  semente.ts
```

## Modelagem de banco

### Entidades

- `User`: usuário e credenciais (email único + hash de senha)
- `Wallet`: carteira 1:1 com usuário
- `WalletBalance`: saldo atual por token (`walletId + token` único)
- `LedgerMovement`: trilha auditável de toda alteração de saldo
- `Transaction`: agrupamento da operação de negócio (DEPOSIT/SWAP/WITHDRAWAL)
- `DepositWebhookEvent`: idempotência para depósito externo
- `RefreshSession`: controle de refresh token com rotação/revogação

### Enums

- `Token`: `BRL | BTC | ETH`
- `MovementType`: `DEPOSIT | SWAP_IN | SWAP_OUT | SWAP_FEE | WITHDRAWAL`
- `TransactionType`: `DEPOSIT | SWAP | WITHDRAWAL`

## Decisões técnicas

- Fastify para API enxuta, rápida e com bom ecossistema de plugins.
- Prisma para tipagem forte e transações consistentes.
- Estratégia de auditoria com:
  - estado atual em `WalletBalance` (leitura rápida)
  - histórico completo em `LedgerMovement` (rastreabilidade)
- Refresh token com sessão no banco para permitir rotação e revogação.
- Uso de `Decimal` (Prisma) para evitar erros de ponto flutuante em valores financeiros.
- Validação de entrada com Zod antes das regras de negócio.

## Regras de negócio principais

- Cadastro cria carteira com 3 saldos iniciais zerados: BRL/BTC/ETH.
- Depósito (`/webhooks/deposit`):
  - valida usuário e token
  - valida `idempotencyKey` única
  - cria `Transaction` do tipo `DEPOSIT`
  - cria `LedgerMovement` do tipo `DEPOSIT`
- Swap:
  - cotação em tempo real via CoinGecko
  - taxa fixa de 1.5%
  - execução gera 3 movimentos (`SWAP_OUT`, `SWAP_FEE`, `SWAP_IN`)
- Saque:
  - valida saldo suficiente
  - debita saldo
  - registra transação e movimento

## Pré-requisitos

- Node.js 20+
- PostgreSQL ativo

## Configuração de ambiente

Arquivo `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nexus_wallet?schema=public"
PORT="3000"
JWT_ACCESS_SECRET="change_this_access_secret_with_32_plus_chars"
JWT_REFRESH_SECRET="change_this_refresh_secret_with_32_plus_chars"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
COINGECKO_BASE_URL="https://api.coingecko.com/api/v3"
```

## Como rodar localmente

1. Instalar dependências

```bash
npm install
```

2. Gerar Prisma Client

```bash
npm run prisma:generate
```

3. Aplicar migration

```bash
npm run prisma:migrate -- --name init
```

4. (Opcional) Popular banco com dados fictícios

```bash
npm run seed
```

5. Subir API

```bash
npm run dev
```

6. Health check

```bash
GET http://localhost:3000/health
```

## Dados fictícios (seed)

Script: `prisma/semente.ts`

O seed cria um usuário para testes:

- Email: `demo@nexus.com`
- Senha: `12345678`

Além disso, cria saldo inicial e lançamentos de ledger/transações para facilitar validação de extrato e histórico.

## Endpoints

### Autenticação

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`

### Carteira

- `GET /wallet/balances` (protegida)

### Webhook de depósito

- `POST /webhooks/deposit`

Payload exemplo:

```json
{
  "userId": "cuid_do_usuario",
  "token": "BRL",
  "amount": "100.50",
  "idempotencyKey": "deposito-001"
}
```

### Conversão (swap)

- `POST /swap/quote` (protegida)
- `POST /swap` (protegida)

Payload exemplo:

```json
{
  "fromToken": "BTC",
  "toToken": "BRL",
  "amount": "0.5"
}
```

### Saques

- `POST /withdrawals` (protegida)

Payload exemplo:

```json
{
  "token": "BRL",
  "amount": "50"
}
```

### Ledger e transações

- `GET /ledger?page=1&pageSize=20` (protegida)
- `GET /transactions?page=1&pageSize=20` (protegida)

## Fluxo de teste rápido (manual)

1. Registrar usuário (`/auth/register`)
2. Salvar `accessToken` retornado
3. Chamar `/wallet/balances` com `Authorization: Bearer <token>`
4. Simular depósito em `/webhooks/deposit`
5. Consultar cotação em `/swap/quote`
6. Executar `/swap`
7. Solicitar `/withdrawals`
8. Consultar `/ledger` e `/transactions`

## Erros esperados e tratamento

- `401 Unauthorized`: token ausente/inválido
- `404 Not Found`: carteira/usuário não encontrados
- `409 Conflict`: `idempotencyKey` duplicada ou conflito de unicidade
- `400 Bad Request`: validação de payload ou saldo insuficiente

## Comandos úteis

- `npm run dev`: desenvolvimento com watch
- `npm run build`: validação TypeScript e build
- `npm start`: execução em produção
- `npm run prisma:generate`: regenerar cliente Prisma
- `npm run prisma:migrate`: criar/aplicar migration
- `npm run prisma:studio`: abrir Prisma Studio
- `npm run seed`: inserir dados de teste

## Observação sobre Prisma 7

Este projeto usa Prisma 7 com adapter PostgreSQL (`@prisma/adapter-pg`) na inicialização do cliente (`src/lib/cliente_prisma.ts`).

## Próximos diferenciais sugeridos

- Cache de cotações com Redis
- Testes automatizados (unitário e integração)
- Rate limiting para rotas sensíveis
- Documentação OpenAPI/Swagger
- Deploy em ambiente público (Railway/Render)
