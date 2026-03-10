import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/cliente_prisma";
import { AppError } from "../lib/erros";
import { formatDecimal } from "../lib/decimal";

export async function walletRoutes(app: FastifyInstance) {
  app.get(
    "/wallet/balances",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: request.authUser.sub },
        include: {
          balances: {
            orderBy: { token: "asc" }
          }
        }
      });

      if (!wallet) {
        throw new AppError("Wallet not found", 404);
      }

      return {
        walletId: wallet.id,
        balances: wallet.balances.map((balance) => ({
          token: balance.token,
          amount: formatDecimal(balance.amount)
        }))
      };
    }
  );
}


