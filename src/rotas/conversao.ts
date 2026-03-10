import { MovementType, Token, TransactionType, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatDecimal, parsePositiveDecimal, percentageOf } from "../lib/decimal";
import { AppError } from "../lib/erros";
import { applyMovement } from "../lib/livro_razao";
import { getSwapRate } from "../lib/mercado";
import { prisma } from "../lib/cliente_prisma";

const quoteSchema = z.object({
  fromToken: z.nativeEnum(Token),
  toToken: z.nativeEnum(Token),
  amount: z.string().min(1)
});

const executeSchema = z.object({
  fromToken: z.nativeEnum(Token),
  toToken: z.nativeEnum(Token),
  amount: z.string().min(1)
});

const FIXED_SWAP_FEE_PERCENTAGE = 1.5;

async function buildQuote(fromToken: Token, toToken: Token, amount: Prisma.Decimal) {
  const rate = await getSwapRate(fromToken, toToken);
  const grossDestination = amount.mul(new Prisma.Decimal(rate));
  const feeAmount = percentageOf(grossDestination, FIXED_SWAP_FEE_PERCENTAGE);
  const netDestination = grossDestination.sub(feeAmount);

  return {
    fromToken,
    toToken,
    sourceAmount: amount,
    rate,
    grossDestination,
    feeToken: toToken,
    feeAmount,
    netDestination
  };
}

export async function swapRoutes(app: FastifyInstance) {
  app.post(
    "/swap/quote",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const { fromToken, toToken, amount: rawAmount } = quoteSchema.parse(request.body);
      const amount = parsePositiveDecimal(rawAmount, "amount");
      const quote = await buildQuote(fromToken, toToken, amount);

      return {
        fromToken: quote.fromToken,
        toToken: quote.toToken,
        sourceAmount: formatDecimal(quote.sourceAmount),
        destinationAmount: formatDecimal(quote.netDestination),
        fee: {
          token: quote.feeToken,
          amount: formatDecimal(quote.feeAmount)
        },
        quote: {
          rate: quote.rate,
          grossDestination: formatDecimal(quote.grossDestination)
        }
      };
    }
  );

  app.post(
    "/swap",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const { fromToken, toToken, amount: rawAmount } = executeSchema.parse(request.body);
      const amount = parsePositiveDecimal(rawAmount, "amount");

      const wallet = await prisma.wallet.findUnique({ where: { userId: request.authUser.sub } });
      if (!wallet) {
        throw new AppError("Wallet not found", 404);
      }

      const quote = await buildQuote(fromToken, toToken, amount);

      const created = await prisma.$transaction(async (tx) => {
        const sourceBalance = await tx.walletBalance.findUnique({
          where: {
            walletId_token: {
              walletId: wallet.id,
              token: fromToken
            }
          }
        });

        if (!sourceBalance || sourceBalance.amount.lt(amount)) {
          throw new AppError("Insufficient balance", 400);
        }

        const transaction = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: TransactionType.SWAP,
            sourceToken: fromToken,
            destinationToken: toToken,
            sourceAmount: amount,
            destinationAmount: quote.netDestination,
            feeToken: quote.feeToken,
            feeAmount: quote.feeAmount,
            externalReference: `rate:${quote.rate}`
          }
        });

        await applyMovement(tx, {
          walletId: wallet.id,
          token: fromToken,
          amount: amount.mul(-1),
          type: MovementType.SWAP_OUT,
          transactionId: transaction.id,
          metadata: { rate: quote.rate }
        });

        await applyMovement(tx, {
          walletId: wallet.id,
          token: toToken,
          amount: quote.feeAmount.mul(-1),
          type: MovementType.SWAP_FEE,
          transactionId: transaction.id,
          metadata: { feePercentage: FIXED_SWAP_FEE_PERCENTAGE },
          allowNegative: true
        });

        await applyMovement(tx, {
          walletId: wallet.id,
          token: toToken,
          amount: quote.grossDestination,
          type: MovementType.SWAP_IN,
          transactionId: transaction.id,
          metadata: { rate: quote.rate }
        });

        return transaction;
      });

      return reply.code(201).send({
        transactionId: created.id,
        sourceAmount: formatDecimal(amount),
        destinationAmount: formatDecimal(quote.netDestination),
        feeAmount: formatDecimal(quote.feeAmount),
        feeToken: quote.feeToken,
        rateUsed: quote.rate
      });
    }
  );
}


