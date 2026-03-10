import axios from "axios";
import { Token } from "@prisma/client";
import { env } from "../config/ambiente";
import { AppError } from "./erros";

const COINS: Record<Token, string | null> = {
  BRL: null,
  BTC: "bitcoin",
  ETH: "ethereum"
};

function normalizeVsCurrency(token: Token): string {
  return token.toLowerCase();
}

export async function getSwapRate(fromToken: Token, toToken: Token): Promise<number> {
  if (fromToken === toToken) {
    throw new AppError("Tokens must be different", 400);
  }

  if (fromToken === Token.BRL) {
    const toId = COINS[toToken];
    if (!toId) {
      throw new AppError("Unsupported token pair", 400);
    }

    const response = await axios.get(`${env.COINGECKO_BASE_URL}/simple/price`, {
      params: {
        ids: toId,
        vs_currencies: normalizeVsCurrency(Token.BRL)
      },
      timeout: 10000
    });

    const toPriceInBrl = response.data?.[toId]?.brl;
    if (!toPriceInBrl) {
      throw new AppError("Could not fetch quote", 502);
    }

    return 1 / Number(toPriceInBrl);
  }

  const fromId = COINS[fromToken];
  if (!fromId) {
    throw new AppError("Unsupported token pair", 400);
  }

  const response = await axios.get(`${env.COINGECKO_BASE_URL}/simple/price`, {
    params: {
      ids: fromId,
      vs_currencies: normalizeVsCurrency(toToken)
    },
    timeout: 10000
  });

  const rate = response.data?.[fromId]?.[normalizeVsCurrency(toToken)];
  if (!rate) {
    throw new AppError("Could not fetch quote", 502);
  }

  return Number(rate);
}


