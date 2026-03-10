import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatDecimal } from "../lib/decimal";
import { AppError } from "../lib/erros";
import { prisma } from "../lib/cliente_prisma";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

export async function ledgerRoutes(app: FastifyInstance) {
  app.get(
    "/ledger",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const { page, pageSize } = querySchema.parse(request.query);
      const wallet = await prisma.wallet.findUnique({ where: { userId: request.authUser.sub } });

      if (!wallet) {
        throw new AppError("Wallet not found", 404);
      }

      const [total, movements] = await prisma.$transaction([
        prisma.ledgerMovement.count({ where: { walletId: wallet.id } }),
        prisma.ledgerMovement.findMany({
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
        items: movements.map((movement) => ({
          id: movement.id,
          transactionId: movement.transactionId,
          type: movement.type,
          token: movement.token,
          amount: formatDecimal(movement.amount),
          previousBalance: formatDecimal(movement.previousBalance),
          newBalance: formatDecimal(movement.newBalance),
          createdAt: movement.createdAt,
          metadata: movement.metadata
        }))
      };
    }
  );
}


