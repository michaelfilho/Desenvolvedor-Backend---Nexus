import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatDecimal } from "../lib/decimal";
import { AppError } from "../lib/erros";
import { prisma } from "../lib/cliente_prisma";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

export async function transactionRoutes(app: FastifyInstance) {
  app.get(
    "/transactions",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const { page, pageSize } = querySchema.parse(request.query);
      const wallet = await prisma.wallet.findUnique({ where: { userId: request.authUser.sub } });

      if (!wallet) {
        throw new AppError("Wallet not found", 404);
      }

      const [total, transactions] = await prisma.$transaction([
        prisma.transaction.count({ where: { walletId: wallet.id } }),
        prisma.transaction.findMany({
          where: { walletId: wallet.id },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      ]);

      return {
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        },
        items: transactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          sourceToken: transaction.sourceToken,
          destinationToken: transaction.destinationToken,
          sourceAmount: formatDecimal(transaction.sourceAmount),
          destinationAmount: formatDecimal(transaction.destinationAmount),
          feeToken: transaction.feeToken,
          feeAmount: formatDecimal(transaction.feeAmount),
          externalReference: transaction.externalReference,
          createdAt: transaction.createdAt
        }))
      };
    }
  );
}


