import { MovementType, Token, TransactionType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatDecimal, parsePositiveDecimal } from "../lib/decimal";
import { AppError } from "../lib/erros";
import { applyMovement } from "../lib/livro_razao";
import { prisma } from "../lib/cliente_prisma";

const requestWithdrawalSchema = z.object({
  token: z.nativeEnum(Token),
  amount: z.string().min(1)
});

export async function withdrawalRoutes(app: FastifyInstance) {
  app.post(
    "/withdrawals",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const { token, amount: rawAmount } = requestWithdrawalSchema.parse(request.body);
      const amount = parsePositiveDecimal(rawAmount, "amount");

      const wallet = await prisma.wallet.findUnique({ where: { userId: request.authUser.sub } });
      if (!wallet) {
        throw new AppError("Wallet not found", 404);
      }

      const transaction = await prisma.$transaction(async (tx) => {
        const transactionRecord = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: TransactionType.WITHDRAWAL,
            sourceToken: token,
            sourceAmount: amount
          }
        });

        await applyMovement(tx, {
          walletId: wallet.id,
          token,
          amount: amount.mul(-1),
          type: MovementType.WITHDRAWAL,
          transactionId: transactionRecord.id
        });

        return transactionRecord;
      });

      return reply.code(201).send({
        transactionId: transaction.id,
        token,
        amount: formatDecimal(amount),
        status: "mocked_processed"
      });
    }
  );
}


