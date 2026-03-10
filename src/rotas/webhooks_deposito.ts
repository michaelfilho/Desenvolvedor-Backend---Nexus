import { MovementType, Token, TransactionType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applyMovement } from "../lib/livro_razao";
import { parsePositiveDecimal } from "../lib/decimal";
import { AppError } from "../lib/erros";
import { prisma } from "../lib/cliente_prisma";

const depositSchema = z.object({
  userId: z.string().min(1),
  token: z.nativeEnum(Token),
  amount: z.string().min(1),
  idempotencyKey: z.string().min(8)
});

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/deposit", async (request, reply) => {
    const payload = depositSchema.parse(request.body);
    const amount = parsePositiveDecimal(payload.amount, "amount");

    const wallet = await prisma.wallet.findUnique({ where: { userId: payload.userId } });
    if (!wallet) {
      throw new AppError("User wallet not found", 404);
    }

    const existingEvent = await prisma.depositWebhookEvent.findUnique({
      where: { idempotencyKey: payload.idempotencyKey }
    });

    if (existingEvent) {
      throw new AppError("Duplicate idempotencyKey", 409, "IDEMPOTENCY_CONFLICT");
    }

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          destinationToken: payload.token,
          destinationAmount: amount,
          externalReference: payload.idempotencyKey
        }
      });

      await applyMovement(tx, {
        walletId: wallet.id,
        token: payload.token,
        amount,
        type: MovementType.DEPOSIT,
        transactionId: transaction.id,
        metadata: { idempotencyKey: payload.idempotencyKey }
      });

      await tx.depositWebhookEvent.create({
        data: {
          idempotencyKey: payload.idempotencyKey,
          userId: payload.userId,
          token: payload.token,
          amount,
          transactionId: transaction.id
        }
      });

      return transaction;
    });

    return reply.code(201).send({
      message: "Deposit processed",
      transactionId: result.id
    });
  });
}


