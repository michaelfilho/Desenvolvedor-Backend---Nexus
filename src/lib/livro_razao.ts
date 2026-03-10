import type { Prisma, PrismaClient } from "@prisma/client";
import { MovementType, Token } from "@prisma/client";
import { AppError } from "./erros";

export async function applyMovement(
  tx: Prisma.TransactionClient | PrismaClient,
  params: {
    walletId: string;
    token: Token;
    amount: Prisma.Decimal;
    type: MovementType;
    transactionId?: string;
    metadata?: Prisma.InputJsonValue;
    allowNegative?: boolean;
  }
) {
  const balance = await tx.walletBalance.findUnique({
    where: {
      walletId_token: {
        walletId: params.walletId,
        token: params.token
      }
    }
  });

  if (!balance) {
    throw new AppError(`Token ${params.token} does not exist for this wallet`, 404);
  }

  const newBalance = balance.amount.add(params.amount);
  if (!params.allowNegative && newBalance.lt(0)) {
    throw new AppError("Insufficient balance", 400);
  }

  await tx.walletBalance.update({
    where: { id: balance.id },
    data: { amount: newBalance }
  });

  await tx.ledgerMovement.create({
    data: {
      walletId: params.walletId,
      transactionId: params.transactionId,
      type: params.type,
      token: params.token,
      amount: params.amount,
      previousBalance: balance.amount,
      newBalance,
      metadata: params.metadata
    }
  });

  return { previousBalance: balance.amount, newBalance };
}


