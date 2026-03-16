import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, MovementType, Token, TransactionType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL nao definido");
}

const pool = new Pool({
  connectionString: databaseUrl
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function semear() {
  const email = "demo@nexus.com";
  const senha = "12345678";

  await prisma.refreshSession.deleteMany();
  await prisma.depositWebhookEvent.deleteMany();
  await prisma.ledgerMovement.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.walletBalance.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany({ where: { email } });

  const hash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      wallet: {
        create: {
          balances: {
            create: [
              { token: Token.BRL, amount: "1000" },
              { token: Token.BTC, amount: "0.05" },
              { token: Token.ETH, amount: "1.5" }
            ]
          }
        }
      }
    },
    include: {
      wallet: true
    }
  });

  if (!usuario.wallet) {
    throw new Error("Carteira nao foi criada");
  }

  const depositoTx = await prisma.transaction.create({
    data: {
      walletId: usuario.wallet.id,
      type: TransactionType.DEPOSIT,
      destinationToken: Token.BRL,
      destinationAmount: "1000",
      externalReference: "seed-deposito-001"
    }
  });

  await prisma.ledgerMovement.create({
    data: {
      walletId: usuario.wallet.id,
      transactionId: depositoTx.id,
      type: MovementType.DEPOSIT,
      token: Token.BRL,
      amount: "1000",
      previousBalance: "0",
      newBalance: "1000",
      metadata: { origem: "seed" }
    }
  });

  const saqueTx = await prisma.transaction.create({
    data: {
      walletId: usuario.wallet.id,
      type: TransactionType.WITHDRAWAL,
      sourceToken: Token.BRL,
      sourceAmount: "100"
    }
  });

  await prisma.ledgerMovement.create({
    data: {
      walletId: usuario.wallet.id,
      transactionId: saqueTx.id,
      type: MovementType.WITHDRAWAL,
      token: Token.BRL,
      amount: "-100",
      previousBalance: "1000",
      newBalance: "900",
      metadata: { origem: "seed" }
    }
  });

  const swapTx = await prisma.transaction.create({
    data: {
      walletId: usuario.wallet.id,
      type: TransactionType.SWAP,
      sourceToken: Token.BRL,
      destinationToken: Token.BTC,
      sourceAmount: "200",
      destinationAmount: "0.0039",
      feeToken: Token.BTC,
      feeAmount: "0.00006",
      externalReference: "seed-rate:0.0000195"
    }
  });

  await prisma.ledgerMovement.createMany({
    data: [
      {
        walletId: usuario.wallet.id,
        transactionId: swapTx.id,
        type: MovementType.SWAP_OUT,
        token: Token.BRL,
        amount: "-200",
        previousBalance: "900",
        newBalance: "700",
        metadata: { origem: "seed" }
      },
      {
        walletId: usuario.wallet.id,
        transactionId: swapTx.id,
        type: MovementType.SWAP_FEE,
        token: Token.BTC,
        amount: "-0.00006",
        previousBalance: "0.05",
        newBalance: "0.04994",
        metadata: { origem: "seed" }
      },
      {
        walletId: usuario.wallet.id,
        transactionId: swapTx.id,
        type: MovementType.SWAP_IN,
        token: Token.BTC,
        amount: "0.00396",
        previousBalance: "0.04994",
        newBalance: "0.0539",
        metadata: { origem: "seed" }
      }
    ]
  });

  await prisma.walletBalance.update({
    where: {
      walletId_token: {
        walletId: usuario.wallet.id,
        token: Token.BRL
      }
    },
    data: { amount: "700" }
  });

  await prisma.walletBalance.update({
    where: {
      walletId_token: {
        walletId: usuario.wallet.id,
        token: Token.BTC
      }
    },
    data: { amount: "0.0539" }
  });

  console.log("Seed concluido com sucesso");
  console.log(`Usuario: ${email}`);
  console.log(`Senha: ${senha}`);
  console.log(`UserId: ${usuario.id}`);
}

semear()
  .catch((erro) => {
    console.error("Erro ao executar seed:", erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
